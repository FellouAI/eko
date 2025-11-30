import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Form, Input, Button, message } from "antd";

// Settings icon
const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

// Check icon
const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

// CSS-in-JS styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#FAF9F7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    WebkitFontSmoothing: 'antialiased' as const,
  },
  content: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '48px 24px',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: 40,
  },
  logo: {
    fontSize: 28,
    fontWeight: 600,
    color: '#1A1A1A',
    marginBottom: 8,
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    border: '1px solid #E5E4E2',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: 500,
    color: '#1A1A1A',
  },
  checkBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    backgroundColor: '#10B981',
    borderRadius: '50%',
    color: 'white',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: 15,
    border: '1px solid #E5E4E2',
    borderRadius: 12,
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    fontFamily: 'inherit',
  },
  inputFocused: {
    borderColor: '#D97706',
    boxShadow: '0 0 0 3px rgba(217, 119, 6, 0.1)',
  },
  helper: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
  },
  link: {
    color: '#D97706',
    textDecoration: 'none',
  },
  button: {
    width: '100%',
    padding: '14px 24px',
    fontSize: 15,
    fontWeight: 500,
    color: 'white',
    backgroundColor: '#CC785C',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'background-color 0.15s',
    marginTop: 24,
    fontFamily: 'inherit',
  },
  buttonHover: {
    backgroundColor: '#B5684D',
  },
  buttonSaved: {
    backgroundColor: '#10B981',
  },
  infoBox: {
    marginTop: 24,
    padding: 20,
    backgroundColor: '#F5F4F2',
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1A1A1A',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 1.6,
  },
  infoList: {
    marginTop: 16,
    paddingLeft: 0,
    listStyle: 'none',
  },
  infoListItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
    fontSize: 13,
    color: '#666',
  },
  bullet: {
    width: 6,
    height: 6,
    backgroundColor: '#CC785C',
    borderRadius: '50%',
    marginTop: 6,
    flexShrink: 0,
  },
};

const OptionsPage = () => {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(["openRouterApiKey"], (result) => {
      if (result.openRouterApiKey) {
        setHasKey(true);
        setApiKey("••••••••••••••••" + result.openRouterApiKey.slice(-4));
      }
    });
  }, []);

  const handleSave = () => {
    if (!apiKey.trim()) {
      message.error("Please enter your OpenRouter API key");
      return;
    }

    // Don't save if it's the masked version
    if (apiKey.startsWith("••••")) {
      message.info("API key unchanged");
      return;
    }

    chrome.storage.sync.set({ openRouterApiKey: apiKey }, () => {
      setSaved(true);
      setHasKey(true);
      // Show masked version after save
      setApiKey("••••••••••••••••" + apiKey.slice(-4));
      message.success("API key saved successfully!");
      setTimeout(() => setSaved(false), 3000);
    });
  };

  const handleFocus = () => {
    if (apiKey.startsWith("••••")) {
      setApiKey("");
      setHasKey(false);
    }
    setFocused(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>Browseless.ai</div>
          <div style={styles.subtitle}>Powered by OpenRouter Auto-Routing</div>
        </div>

        {/* Card */}
        <div style={styles.card}>
          {/* Label */}
          <div style={styles.label}>
            <span>OpenRouter API Key</span>
            {hasKey && (
              <span style={styles.checkBadge}>
                <CheckIcon />
              </span>
            )}
          </div>

          {/* Input */}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onFocus={handleFocus}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder="sk-or-..."
            style={{
              ...styles.input,
              ...(focused ? styles.inputFocused : {}),
            }}
          />

          {/* Helper text */}
          <div style={styles.helper}>
            Get your API key at{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              openrouter.ai/keys
            </a>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            style={{
              ...styles.button,
              ...(saved ? styles.buttonSaved : {}),
            }}
            onMouseOver={(e) => {
              if (!saved) {
                (e.target as HTMLButtonElement).style.backgroundColor = '#B5684D';
              }
            }}
            onMouseOut={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = saved ? '#10B981' : '#CC785C';
            }}
          >
            {saved ? (
              <>
                <CheckIcon />
                Saved!
              </>
            ) : (
              <>
                <SettingsIcon />
                Save API Key
              </>
            )}
          </button>
        </div>

        {/* Info box */}
        <div style={styles.infoBox}>
          <div style={styles.infoTitle}>How it works</div>
          <div style={styles.infoText}>
            Browseless.ai uses OpenRouter's intelligent auto-routing to automatically
            select the best AI model for each task, delivering 8-10% better performance
            than manually selecting models.
          </div>
          <ul style={styles.infoList}>
            <li style={styles.infoListItem}>
              <span style={styles.bullet}></span>
              <span><strong>Planning</strong> — Higher creativity for flexible task planning</span>
            </li>
            <li style={styles.infoListItem}>
              <span style={styles.bullet}></span>
              <span><strong>Navigation</strong> — Precise, deterministic browser control</span>
            </li>
            <li style={styles.infoListItem}>
              <span style={styles.bullet}></span>
              <span><strong>Compression</strong> — Fast, accurate context summarization</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>
);
