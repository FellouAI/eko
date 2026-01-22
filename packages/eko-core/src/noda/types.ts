/**
 * Noda.io Web API Types
 * Types for interacting with Noda VR mind mapping platform
 * @see https://noda.io/documentation/webapi.html
 */

/**
 * Available node shapes in Noda
 */
export type NodaNodeShape =
  | "Ball"
  | "Box"
  | "Tetra"
  | "Cylinder"
  | "Diamond"
  | "Hourglass"
  | "Plus"
  | "Star";

/**
 * Available link shapes/patterns in Noda
 */
export type NodaLinkShape = "Solid" | "Dash" | "Arrows";

/**
 * Link curve types
 */
export type NodaLinkCurve = "none" | "cdown" | "cup" | "sdown" | "sup";

/**
 * Link trail animation types
 */
export type NodaLinkTrail = "none" | "ring" | "ball" | "cone";

/**
 * Location reference frame for positioning
 */
export type NodaLocationFrame = "world" | "user" | "node";

/**
 * 3D location for node positioning
 */
export interface NodaLocation {
  x: number;
  y: number;
  z: number;
  relativeTo?: NodaLocationFrame;
  referenceUuid?: string;
}

/**
 * Properties for creating/updating a node
 */
export interface NodaNodeProperties {
  /** Unique identifier (numeric or string) */
  uuid?: string;
  /** Display text above the node */
  title?: string;
  /** Hex color value (#000000 format) */
  color?: string;
  /** Opacity from 0 (transparent) to 1 (opaque) */
  opacity?: number;
  /** Node shape */
  shape?: NodaNodeShape;
  /** Public image URL (https protocol) */
  imageUrl?: string;
  /** Free-form text field for notes */
  notes?: string;
  /** Associated webpage link */
  pageUrl?: string;
  /** Size from 1-45 (default: 5) */
  size?: number;
  /** 3D positioning */
  location?: NodaLocation;
  /** Whether the node is selected */
  selected?: boolean;
  /** Whether child nodes are collapsed */
  collapsed?: boolean;
}

/**
 * Properties for creating/updating a link
 */
export interface NodaLinkProperties {
  /** Unique identifier */
  uuid?: string;
  /** Starting node identifier */
  fromUuid: string;
  /** Ending node identifier */
  toUuid: string;
  /** Display text on the link */
  title?: string;
  /** Hex color value */
  color?: string;
  /** Link pattern */
  shape?: NodaLinkShape;
  /** Thickness from 1-10 (default: 1) */
  size?: number;
  /** Whether the link is selected */
  selected?: boolean;
  /** Curve type */
  curve?: NodaLinkCurve;
  /** Trail animation */
  trail?: NodaLinkTrail;
}

/**
 * Response from node operations
 */
export interface NodaNodeResponse {
  uuid: string;
  title?: string;
  color?: string;
  opacity?: number;
  shape?: NodaNodeShape;
  imageUrl?: string;
  notes?: string;
  pageUrl?: string;
  size?: number;
  location?: NodaLocation;
  selected?: boolean;
  collapsed?: boolean;
}

/**
 * Response from link operations
 */
export interface NodaLinkResponse {
  uuid: string;
  fromUuid: string;
  toUuid: string;
  title?: string;
  color?: string;
  shape?: NodaLinkShape;
  size?: number;
  selected?: boolean;
  curve?: NodaLinkCurve;
  trail?: NodaLinkTrail;
}

/**
 * User information from Noda
 */
export interface NodaUser {
  userId: string;
}

/**
 * Filter criteria for listing nodes
 */
export interface NodaNodeFilter {
  uuid?: string;
  title?: string;
  selected?: boolean;
  shape?: NodaNodeShape;
}

/**
 * Filter criteria for listing links
 */
export interface NodaLinkFilter {
  uuid?: string;
  fromUuid?: string;
  toUuid?: string;
  selected?: boolean;
}

/**
 * Event handler types for Noda events
 */
export interface NodaEventHandlers {
  onNodeCreated?: (node: NodaNodeResponse) => void;
  onNodeUpdated?: (node: NodaNodeResponse) => void;
  onNodeDeleted?: (node: { uuid: string }) => void;
  onLinkCreated?: (link: NodaLinkResponse) => void;
  onLinkUpdated?: (link: NodaLinkResponse) => void;
  onLinkDeleted?: (link: { uuid: string }) => void;
}

/**
 * The Noda window API interface
 */
export interface NodaAPI {
  createNode: (properties: NodaNodeProperties) => Promise<NodaNodeResponse>;
  updateNode: (properties: NodaNodeProperties) => Promise<NodaNodeResponse>;
  deleteNode: (properties: { uuid: string }) => Promise<void>;
  listNodes: (filter?: NodaNodeFilter) => Promise<NodaNodeResponse[]>;
  createLink: (properties: NodaLinkProperties) => Promise<NodaLinkResponse>;
  updateLink: (properties: NodaLinkProperties) => Promise<NodaLinkResponse>;
  deleteLink: (properties: { uuid: string }) => Promise<void>;
  listLinks: (filter?: NodaLinkFilter) => Promise<NodaLinkResponse[]>;
  getUser: () => Promise<NodaUser>;
  onNodeCreated?: (node: NodaNodeResponse) => void;
  onNodeUpdated?: (node: NodaNodeResponse) => void;
  onNodeDeleted?: (node: { uuid: string }) => void;
  onLinkCreated?: (link: NodaLinkResponse) => void;
  onLinkUpdated?: (link: NodaLinkResponse) => void;
  onLinkDeleted?: (link: { uuid: string }) => void;
}

/**
 * Mind map structure for import/export
 */
export interface NodaMindMap {
  nodes: NodaNodeProperties[];
  links: NodaLinkProperties[];
  metadata?: {
    name?: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

/**
 * Extend the Window interface to include Noda API
 */
declare global {
  interface Window {
    noda?: NodaAPI;
  }
}
