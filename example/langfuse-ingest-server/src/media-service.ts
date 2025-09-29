import {
  LangfuseAPIClient,
  LangfuseMedia,
  LangfuseOtelSpanAttributes,
  Logger,
  base64ToBytes,
  getGlobalLogger,
} from "@langfuse/core";
import type { AttributeValue } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

const DATA_URI_REGEX = /data:[^;]+;base64,[A-Za-z0-9+/=]+/g;

const MEDIA_ATTRIBUTE_PREFIXES = [
  LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
  LangfuseOtelSpanAttributes.TRACE_INPUT,
  LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
  LangfuseOtelSpanAttributes.TRACE_OUTPUT,
  LangfuseOtelSpanAttributes.OBSERVATION_METADATA,
  LangfuseOtelSpanAttributes.TRACE_METADATA,
];

const AI_SDK_MEDIA_ATTRIBUTES = ["ai.prompt.messages", "ai.prompt"];

type UploadField = "input" | "output" | "metadata";

type ScheduleUploadParams = {
  span: ReadableSpan;
  field: UploadField;
  media: LangfuseMedia;
};

type HandleUploadParams = {
  media: LangfuseMedia;
  traceId: string;
  observationId?: string;
  field: UploadField;
};

export class MediaService {
  private readonly pendingMediaUploads = new Set<Promise<void>>();
  private readonly apiClient: LangfuseAPIClient;

  constructor(params: { apiClient: LangfuseAPIClient }) {
    this.apiClient = params.apiClient;
  }

  private get logger(): Logger {
    return getGlobalLogger();
  }

  async flush(): Promise<void> {
    await Promise.all(Array.from(this.pendingMediaUploads));
  }

  async process(span: ReadableSpan): Promise<void> {
    await this.handleStandardAttributes(span);
    await this.handleAiSdkAttributes(span);
  }

  private async handleStandardAttributes(span: ReadableSpan): Promise<void> {
    for (const attributePrefix of MEDIA_ATTRIBUTE_PREFIXES) {
      const eligibleKeys = Object.keys(span.attributes).filter((key) =>
        key.startsWith(attributePrefix)
      );

      for (const key of eligibleKeys) {
        const value = span.attributes[key];
        if (typeof value !== "string") {
          this.logger.warn(
            `Span attribute ${attributePrefix} is not a string. Skipping media handling.`
          );
          continue;
        }

        let updatedValue = value;
        const matches = [...new Set(value.match(DATA_URI_REGEX) ?? [])];
        if (matches.length === 0) continue;

        for (const dataUri of matches) {
          const media = new LangfuseMedia({
            base64DataUri: dataUri,
            source: "base64_data_uri",
          });

          const mediaTag = await media.getTag();
          if (!mediaTag) {
            this.logger.warn(
              "Failed to create Langfuse media tag. Skipping media item."
            );
            continue;
          }

          this.scheduleUpload({
            span,
            media,
            field: this.resolveField(attributePrefix),
          });

          updatedValue = updatedValue.replaceAll(dataUri, mediaTag);
        }

        (span.attributes as Record<string, AttributeValue>)[key] =
          updatedValue as AttributeValue;
      }
    }
  }

  private async handleAiSdkAttributes(span: ReadableSpan): Promise<void> {
    if (span.instrumentationScope.name !== "ai") {
      return;
    }

    for (const attributeKey of AI_SDK_MEDIA_ATTRIBUTES) {
      const rawValue = span.attributes[attributeKey];
      if (!rawValue || typeof rawValue !== "string") {
        continue;
      }

      let updatedValue = rawValue;

      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          for (const message of parsed) {
            if (!Array.isArray(message?.content)) continue;

            for (const part of message.content) {
              if (part?.type !== "file") continue;

              let base64Content: string | null = null;

              if (part?.data && typeof part.mediaType === "string") {
                base64Content = part.data as string;
              }

              if (!base64Content && part?.image && typeof part.mediaType === "string") {
                base64Content = part.image as string;
              }

              if (!base64Content) continue;

              const mediaType = typeof part.mediaType === "string" ? part.mediaType : null;
              if (!mediaType) continue;

              const media = new LangfuseMedia({
                contentType: mediaType as any,
                contentBytes: base64ToBytes(base64Content),
                source: "bytes",
              });

              const mediaTag = await media.getTag();
              if (!mediaTag) {
                this.logger.warn(
                  "Failed to create Langfuse media tag. Skipping media item."
                );
                continue;
              }

              this.scheduleUpload({
                span,
                media,
                field: "input",
              });

              updatedValue = updatedValue.replaceAll(base64Content, mediaTag);
            }
          }
        }

        (span.attributes as Record<string, AttributeValue>)[attributeKey] =
          updatedValue as AttributeValue;
      } catch (err) {
        this.logger.warn(
          `Failed to handle media for AI SDK attribute ${attributeKey} for span ${span.spanContext().spanId}`,
          err
        );
      }
    }
  }

  private resolveField(attributePrefix: string): UploadField {
    if (attributePrefix.includes("input")) return "input";
    if (attributePrefix.includes("output")) return "output";
    return "metadata";
  }

  private scheduleUpload(params: ScheduleUploadParams) {
    const { span, field, media } = params;

    const uploadPromise = this.handleUpload({
      media,
      traceId: span.spanContext().traceId,
      observationId: span.spanContext().spanId,
      field,
    }).catch((err) => {
      this.logger.error("Media upload failed with error:", err);
    });

    this.pendingMediaUploads.add(uploadPromise);
    void uploadPromise.finally(() => this.pendingMediaUploads.delete(uploadPromise));
  }

  private async handleUpload({
    media,
    traceId,
    observationId,
    field,
  }: HandleUploadParams): Promise<void> {
    try {
      const hash = await media.getSha256Hash();

      if (
        !media.contentLength ||
        !media._contentType ||
        !hash ||
        !media._contentBytes
      ) {
        return;
      }

      const { uploadUrl, mediaId } = await this.apiClient.media.getUploadUrl({
        contentLength: media.contentLength,
        traceId,
        observationId,
        field,
        contentType: media._contentType,
        sha256Hash: hash,
      });

      if (!uploadUrl) {
        this.logger.debug(
          `Media status: Media with ID ${mediaId} already uploaded. Skipping.`
        );
        return;
      }

      const clientSideMediaId = await media.getId();
      if (clientSideMediaId !== mediaId) {
        this.logger.error(
          `Media integrity error: Media ID mismatch between SDK (${clientSideMediaId}) and Server (${mediaId}). Upload cancelled.`
        );
        return;
      }

      const start = Date.now();
      const uploadResponse = await this.uploadWithBackoff({
        uploadUrl,
        contentBytes: media._contentBytes,
        contentType: media._contentType,
        contentSha256Hash: hash,
        maxRetries: 3,
        baseDelay: 1000,
      });

      if (!uploadResponse) {
        throw new Error("Media upload process failed");
      }

      await this.apiClient.media.patch(mediaId, {
        uploadedAt: new Date().toISOString(),
        uploadHttpStatus: uploadResponse.status,
        uploadHttpError: await uploadResponse.text(),
        uploadTimeMs: Date.now() - start,
      });

      this.logger.debug(`Media upload status reported for ${mediaId}`);
    } catch (err) {
      this.logger.error(`Error processing media item: ${err}`);
    }
  }

  private async uploadWithBackoff(params: {
    uploadUrl: string;
    contentType: string;
    contentSha256Hash: string;
    contentBytes: Uint8Array;
    maxRetries: number;
    baseDelay: number;
  }): Promise<Response | null> {
    const { uploadUrl, contentType, contentSha256Hash, contentBytes, maxRetries, baseDelay } =
      params;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetch(uploadUrl, {
          method: "PUT",
          body: contentBytes,
          headers: {
            "Content-Type": contentType,
            "x-amz-checksum-sha256": contentSha256Hash,
            "x-ms-blob-type": "BlockBlob",
          },
        });

        if (response.status === 200 || response.status === 201) {
          return response;
        }

        if (attempt < maxRetries) {
          throw new Error(`Upload failed with status ${response.status}`);
        }

        return response;
      } catch (err) {
        if (attempt === maxRetries) {
          throw err;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      }
    }

    return null;
  }
}
