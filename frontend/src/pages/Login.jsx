import { useState } from "react";
import { useAuth } from "../auth";
import { Button, Field, Icon } from "../ui";

export default function Login() {
  const { login, demoMode } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email.trim(), form.password);
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  const useDemo = () => {
    setForm({ email: "admin@leadbridge.demo", password: "LeadBridge#2024" });
    setError("");
  };

  return (
    <div className="auth-screen">
      <div className="auth-visual">
        <div className="auth-brand">
          <div className="brand-mark" style={{ width: 40, height: 40 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M6 18V6h2.6v9.6H18V18H6z" fill="#fff" />
              <circle cx="17.6" cy="7.2" r="2.4" fill="#3ddc97" />
            </svg>
          </div>
          <div>
            <div className="brand-name">LeadBridge</div>
            <div className="brand-sub" style={{ color: "#7f8ba8" }}>Lead operations platform</div>
          </div>
        </div>

        <div className="auth-hero">
          <h1>Business leads you collected the right way.</h1>
          <p>
            One workspace for authorized directories, official company websites, licensed providers
            and your own inbound forms — with validation, duplicate detection and consent checks
            built into every step.
          </p>
        </div>

        <div className="auth-points">
          {[
            "Robots.txt, rate limits and allowlists enforced in the extraction engine",
            "A website phone number is never labelled “verified” without real evidence",
            "Do Not Contact and suppression lists block failing exports automatically",
            "Every record keeps its source attribution and full audit history",
          ].map((point) => (
            <div className="auth-point" key={point}>
              <span className="tick"><Icon name="check" size={12} strokeWidth={2.6} /></span>
              <span>{point}</span>
            </div>
          ))}
        </div>

        <div className="auth-foot">
          No CAPTCHA bypassing · No personal or sensitive attributes · Compliant calling lists only
        </div>
      </div>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="sub">Use your work account to access the lead workspace.</p>

          {error && (
            <div className="alert danger mb-2">
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="auth-stack">
            <Field label="Work email" required>
              <input
                className="input"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
                autoFocus
              />
            </Field>

            <Field label="Password" required>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: "var(--faint)", display: "grid", placeItems: "center", padding: 4 }}
                >
                  <Icon name="eye" size={16} />
                </button>
              </div>
            </Field>

            <Button type="submit" variant="primary" size="lg" block loading={loading}>
              Sign in to LeadBridge
            </Button>
          </div>

          {demoMode && (
            <div className="auth-hint">
              <strong>Demo workspace.</strong> Sign in with{" "}
              <code>admin@leadbridge.demo</code> / <code>LeadBridge#2024</code>.{" "}
              <button
                type="button"
                onClick={useDemo}
                style={{ border: "none", background: "transparent", color: "var(--primary)", cursor: "pointer", padding: 0, fontWeight: 600 }}
              >
                Fill credentials
              </button>
              . Agent role: <code>maya@leadbridge.demo</code> (same password).
            </div>
          )}

          <p className="xs faint mt-3" style={{ lineHeight: 1.6 }}>
            Sessions are held in an httpOnly cookie. Accounts lock for 15 minutes after 5 failed
            attempts and every sign-in is written to the audit log.
          </p>
        </form>
      </div>
    </div>
  );
}
