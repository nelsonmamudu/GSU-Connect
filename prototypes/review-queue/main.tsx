import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createMockReview,
  dept,
  levels,
  formatLevel,
  type Role,
  type Application,
} from "./mockReview";
import "./style.css";
const service = createMockReview();
const presets = [
  "Document unreadable",
  "Name or ID does not match",
  "Wrong level selected",
];
function Sheet({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog className={wide ? "wide" : ""} ref={ref} onCancel={close}>
      <header>
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={close}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Paper({ c }: { c: Application }) {
  return (
    <article className="paper">
      <small>GSU CONNECT · SAMPLE RECORD</small>
      <h2>{c.proof}</h2>
      <hr />
      <dl>
        <dt>Name on record</dt>
        <dd>{c.name}</dd>
        <dt>Department</dt>
        <dd>{c.department}</dd>
        <dt>Registration ID</dt>
        <dd>{c.id}</dd>
        {c.level && (
          <>
            <dt>Academic standing</dt>
            <dd>{formatLevel(c.level)}</dd>
          </>
        )}
      </dl>
      <footer>Generated specimen · not an official document</footer>
    </article>
  );
}
function Viewer({ c, close }: { c: Application; close: () => void }) {
  const [zoom, set] = useState(1);
  return (
    <Sheet wide title="Inspect proof" close={close}>
      <div className="zoom">
        <button disabled={zoom <= 1} onClick={() => set((z) => z - 0.5)}>
          Zoom out
        </button>
        <b>{zoom * 100}%</b>
        <button disabled={zoom >= 3} onClick={() => set((z) => z + 0.5)}>
          Zoom in
        </button>
      </div>
      <p>Pinch to zoom, or use the buttons and scroll.</p>
      <div className="canvas">
        <div style={{ width: `${zoom * 100}%`, fontSize: `${zoom}rem` }}>
          <Paper c={c} />
        </div>
      </div>
    </Sheet>
  );
}
function App() {
  const [role, setRole] = useState<Role>("Admin"),
    [selected, select] = useState<Application | null>(null),
    [level, setLevel] = useState(""),
    [kind, setKind] = useState("All types"),
    [department, setDept] = useState("All departments"),
    [modal, setModal] = useState(""),
    [preset, setPreset] = useState(""),
    [note, setNote] = useState(""),
    [msg, setMsg] = useState(""),
    [error, setError] = useState(""),
    [rev, refresh] = useState(0);
  const c = selected;
  const cases = service
    .list(role)
    .filter(
      (x) =>
        (kind === "All types" || x.kind === kind) &&
        (department === "All departments" || x.department === department)
    );
  const reason = [preset, note.trim()].filter(Boolean).join(". ");
  const invite = role === "Class rep" ? service.invite(role) : null;
  const close = () => {
    setModal("");
    setError("");
  };
  const open = (x: Application) => {
    select(x);
    setLevel(x.level);
    setMsg("");
    setPreset("");
    setNote("");
    close();
    window.scrollTo(0, 0);
  };
  const finish = (d: "approved" | "rejected") => {
    if (!c) return;
    try {
      service.decide(role, c.id, d, level, reason);
      select(null);
      close();
      setMsg(`${c.name} ${d}. Mock decision saved.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <nav>
        <strong>
          G<span> / </span>GSU Connect
        </strong>
        <span className="pill">Prototype</span>
      </nav>
      <main>
        <aside>
          <label>
            Demo perspective
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role);
                select(null);
                close();
                setKind("All types");
                setDept("All departments");
                setMsg("");
              }}
            >
              {["Admin", "Class rep", "Unassigned rep"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <small>Fictional records · changes reset on reload</small>
        </aside>
        {!c ? (
          <>
            <small className="eyebrow">VERIFICATION DESK</small>
            <h1>Review queue</h1>
            <p>
              {role === "Admin"
                ? "Review student and staff applications across departments."
                : role === "Class rep"
                ? `${dept} · 200 Level · Student applications`
                : "Your review scope hasn’t been confirmed."}
            </p>
            {invite && (
              <button
                onClick={() => {
                  setMsg("");
                  setModal("invite");
                }}
              >
                Invite students ↗
              </button>
            )}
            {role === "Admin" && (
              <div className="filters">
                <label>
                  Department
                  <select
                    value={department}
                    onChange={(e) => setDept(e.target.value)}
                  >
                    {["All departments", dept, "Biology"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Application
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    {["All types", "Student", "Staff"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <header>
              <h2>
                Ready to review <em>{cases.length}</em>
              </h2>
              <small>Oldest first</small>
            </header>
            <p role="status">{msg}</p>
            {cases.map((x) => (
              <button className="card" key={x.id} onClick={() => open(x)}>
                <small>
                  {x.kind} · {x.hours}h waiting
                </small>
                <strong>
                  {x.name} {x.invited && <span className="badge">Invited</span>}
                </strong>
                <span>
                  {x.department}
                  {x.level && ` · ${formatLevel(x.level)}`}
                </span>
                <b aria-hidden="true">›</b>
              </button>
            ))}
            {!cases.length && (
              <section>
                {role === "Unassigned rep"
                  ? "Ask an admin to confirm your department and level."
                  : "No applications are ready in this view."}
              </section>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => {
                select(null);
                close();
              }}
            >
              ← Back to queue
            </button>
            <small className="eyebrow">APPLICATION / {c.id}</small>
            <h1>{c.name}</h1>
            <p>
              {c.kind} · {c.department}
            </p>
            <section>
              <h2>Submitted evidence</h2>
              {c.proof.includes("email") || c.proof.includes("vouch") ? (
                <>
                  <strong>{c.proof}</strong>
                  <p>
                    {c.proof.includes("email")
                      ? "Mailbox confirmed · fictional staff account"
                      : "Confirmed by a verified colleague in " + c.department}
                  </p>
                </>
              ) : (
                <>
                  <Paper c={c} />
                  <button onClick={() => setModal("view")}>
                    Inspect full screen ↗
                  </button>
                </>
              )}
              {c.level && (
                <>
                  <p>
                    Applicant selected: <b>{formatLevel(c.level)}</b>
                  </p>
                  <label>
                    Reviewer-confirmed level
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                    >
                      {levels.map((v) => (
                        <option value={v} key={v}>
                          {formatLevel(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>
                    Check the form. Change the level only if the evidence
                    differs.
                  </small>
                </>
              )}
            </section>
            <div className="actions">
              <button onClick={() => setModal("reject")}>Reject…</button>
              <button className="primary" onClick={() => setModal("approve")}>
                Approve…
              </button>
            </div>
            <details>
              <summary>Prototype controls</summary>
              <button
                onClick={() => {
                  service.simulate(c.id);
                  setMsg(
                    "Mock concurrent review applied. Try recording your decision."
                  );
                }}
              >
                Simulate another reviewer deciding
              </button>
              <p role="status">{msg}</p>
            </details>
          </>
        )}
        {c && modal === "view" && <Viewer c={c} close={close} />}
        {c && ["approve", "reject"].includes(modal) && (
          <Sheet
            title={`${modal === "approve" ? "Approve" : "Reject"} ${c.name}?`}
            close={close}
          >
            {modal === "reject" ? (
              <>
                <label>
                  Quick reason
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                  >
                    <option value="">Choose a reason or write a note</option>
                    {presets.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Editable note
                  <textarea
                    value={note}
                    maxLength={400}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <section>
                  <small>APPLICANT WILL SEE</small>
                  <p>{reason || "Add a reason before rejecting."}</p>
                </section>
              </>
            ) : (
              <p>
                Confirm you checked {c.name}’s evidence
                {c.level && ` and confirmed ${formatLevel(level)}`}. This
                changes only the mock record.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="actions">
              <button autoFocus onClick={close}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={modal === "reject" && !reason}
                onClick={() =>
                  finish(modal === "approve" ? "approved" : "rejected")
                }
              >
                Confirm {modal === "approve" ? "approval" : "rejection"}
              </button>
            </div>
          </Sheet>
        )}
        {invite && ["invite", "replace"].includes(modal) && (
          <Sheet
            title={
              modal === "replace" ? "Replace this link?" : "Department invite"
            }
            close={close}
          >
            <p>
              {dept} · Expires {new Date(invite.expires).toLocaleDateString()}
            </p>
            {modal === "replace" ? (
              <>
                <p>The old demo link will no longer be current.</p>
                <button onClick={() => setModal("invite")}>Cancel</button>{" "}
                <button
                  onClick={() => {
                    service.invite(role, true);
                    refresh(rev + 1);
                    setMsg("Link replaced.");
                    setModal("invite");
                  }}
                >
                  Confirm replacement
                </button>
              </>
            ) : (
              <>
                <p>Department context only. No approval or chat membership.</p>
                <label>
                  Nonfunctional demo link
                  <input
                    readOnly
                    value={invite.link}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <div className="actions">
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(invite.link);
                        setMsg("Demo link copied.");
                      } catch {
                        setMsg("Select the demo link and copy it manually.");
                      }
                    }}
                  >
                    Copy link
                  </button>
                  {!!navigator.share && (
                    <button
                      onClick={async () => {
                        try {
                          await navigator.share({ text: invite.link });
                        } catch {
                          setMsg("Link was not shared.");
                        }
                      }}
                    >
                      Share
                    </button>
                  )}
                  <button onClick={() => setModal("replace")}>Replace…</button>
                </div>
                <p role="status">{msg}</p>
              </>
            )}
          </Sheet>
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
