import React, { useState } from "react";
import "./App.css";

interface Profile {
  id: string;
  name: string;
  email: string;
  domain: string;
  bio?: string;
  avatar?: string;
}

const mockProfiles: Profile[] = [
  {
    id: "7",
    name: "Zhang Qingyu",
    email: "zhangqingyu@fellou.ai",
    domain: "AI Research",
    bio: "AI researcher and engineer passionate about building intelligent systems",
    avatar: "🤖"
  },
  {
    id: "8",
    name: "Ni Jingzhe",
    email: "nijingzhe@fellou.ai",
    domain: "AI Research",
    bio: "AI researcher and engineer passionate about building intelligent systems",
    avatar: "🤖"
  }
];

const App = () => {
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState("");

  const handleProfileClick = (profile: Profile) => {
    setSelectedProfile(profile);
    setStatus("");
  };

  const handleCloseDetail = () => {
    setSelectedProfile(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🌐 Profile Network</h1>
        <p className="subtitle">Click on any profile card to view details</p>
        {status && <div className="status-message">{status}</div>}
      </header>

      <div className="app-content">
        <div className="profiles-grid">
          {mockProfiles.map((profile) => (
            <div
              key={profile.id}
              className="profile-card"
              onClick={() => handleProfileClick(profile)}
            >
              <div className="profile-avatar">{profile.avatar || "👤"}</div>
              <div className="profile-info">
                <h3 className="profile-name">{profile.name}</h3>
                <p className="profile-domain">{profile.domain}</p>
              </div>
            </div>
          ))}
        </div>

        {selectedProfile && (
          <div className="profile-detail-overlay" onClick={handleCloseDetail}>
            <div className="profile-detail-card" onClick={(e) => e.stopPropagation()}>
              <button className="close-button" onClick={handleCloseDetail}>×</button>
              <div className="detail-avatar">{selectedProfile.avatar || "👤"}</div>
              <h2 className="detail-name">{selectedProfile.name}</h2>
              <div className="detail-section">
                <label>Email:</label>
                <p className="detail-email">{selectedProfile.email}</p>
              </div>
              <div className="detail-section">
                <label>Domain:</label>
                <p className="detail-domain">{selectedProfile.domain}</p>
              </div>
              {selectedProfile.bio && (
                <div className="detail-section">
                  <label>Bio:</label>
                  <p className="detail-bio">{selectedProfile.bio}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="agent-info">
        <p>🤖 Auto testing started, press Command + Option + I to view the process.</p>
      </div>
    </div>
  );
};

export default App;

