import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Video } from "@remotion/media";
import proof from "./proof.json";
const teal = "#59dcd0";
const panel: React.CSSProperties = {
  background: "#102a35f5",
  border: "1px solid #31545e",
  borderRadius: 18,
  padding: 38,
};
export const Beat = ({
  name,
  title,
  subtitle,
  asset,
  label,
}: {
  name: string;
  title: string;
  subtitle: string;
  asset: string;
  label: string;
}) => {
  const f = useCurrentFrame();
  const hero = name === "Opening" || name === "Closing";
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 93,
          height: 126,
        }}
      >
        <div
          style={{
            fontSize: hero ? 78 : 64,
            fontWeight: 800,
            letterSpacing: hero ? -3 : -2,
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 30, color: "#a9c9ce", marginTop: 12 }}>
          {subtitle}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 253,
          height: 633,
          overflow: "hidden",
          border: "1px solid #31545e",
          borderRadius: 18,
          background: "#0b1b23",
        }}
      >
        {hero || name === "Overview" ? (
          <Video
            muted
            objectFit="contain"
            src={staticFile("room.mp4")}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <Img
            src={staticFile(
              (name === "Evidence" && f >= 210 ? "evidence" : asset) + ".png",
            )}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition:
                name === "Evidence"
                  ? "center 85%"
                  : name === "Patient"
                    ? "center 85%"
                    : "center 40%",
              opacity: name === "Architecture" || name === "Proof" ? 0.22 : 1,
            }}
          />
        )}
        {name === "Preparation" && (
          <div
            style={{
              position: "absolute",
              right: 32,
              top: 30,
              width: 880,
              height: 545,
              overflow: "hidden",
              borderRadius: 12,
              boxShadow: "0 0 0 3px #59dcd0",
            }}
          >
            <Img
              src={staticFile("draft.png")}
              style={{
                position: "absolute",
                width: 3456,
                maxWidth: "none",
                left: -2290,
                top: -453,
              }}
            />
          </div>
        )}
        {name === "Handoff" && f >= 60 && (
          <div
            style={{
              ...panel,
              position: "absolute",
              left: 120,
              right: 120,
              top: 90,
            }}
          >
            <div style={{ color: teal, fontSize: 25, letterSpacing: 2 }}>
              EARLIER ASTRA CHECKPOINT · REVOICED WITH GPT LIVE
            </div>
            <div style={{ fontSize: 49, lineHeight: 1.3, marginTop: 24 }}>
              “{proof.followUpQuestion}”
            </div>
            <div style={{ fontSize: 27, color: "#9cbac3", marginTop: 24 }}>
              Actual question from retained receipt · separate run
            </div>
          </div>
        )}
        {name === "Architecture" && f < 165 && (
          <div
            style={{
              position: "absolute",
              inset: 55,
              display: "flex",
              alignItems: "center",
              gap: 24,
            }}
          >
            {[
              ["01", "Recorded evidence", "Actions · notes · transcript"],
              ["02", "Astra / Agents API", "get_evidence"],
              ["03", "Validated output", "submit_examiner_output"],
            ].map(([n, t, d], i) => (
              <div
                key={n}
                style={{
                  ...panel,
                  flex: 1,
                  minHeight: 260,
                  opacity: interpolate(f, [i * 18, i * 18 + 14], [0.25, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                <div style={{ fontSize: 30, color: teal }}>{n}</div>
                <div style={{ fontSize: 39, fontWeight: 700, marginTop: 20 }}>
                  {t}
                </div>
                <div
                  style={{
                    fontSize: 25,
                    color: "#a9c9ce",
                    marginTop: 24,
                    overflowWrap: "anywhere",
                  }}
                >
                  {d}
                </div>
              </div>
            ))}
          </div>
        )}
        {name === "Architecture" && f >= 165 && (
          <div
            style={{
              position: "absolute",
              inset: 55,
              display: "flex",
              alignItems: "center",
              gap: 24,
            }}
          >
            {[
              ["Timely care", "Assess and act"],
              ["Delayed care", "Recognize deterioration"],
              ["Inappropriate attempts", "Review and correct"],
            ].map(([t, d]) => (
              <div key={t} style={{ ...panel, flex: 1, minHeight: 260 }}>
                <div style={{ fontSize: 39, fontWeight: 700, color: teal }}>
                  {t}
                </div>
                <div style={{ fontSize: 28, color: "#a9c9ce", marginTop: 30 }}>
                  {d}
                </div>
              </div>
            ))}
          </div>
        )}
        {name === "Proof" && (
          <div
            style={{
              position: "absolute",
              inset: 45,
              display: "flex",
              gap: 28,
            }}
          >
            <div style={{ ...panel, flex: 1 }}>
              <div style={{ fontSize: 25, color: teal, letterSpacing: 2 }}>
                EARLIER INTEGRATION VERIFICATION
              </div>
              <div style={{ fontSize: 46, fontWeight: 750, marginTop: 22 }}>
                {proof.model}
              </div>
              <div style={{ fontSize: 30, lineHeight: 1.8, marginTop: 20 }}>
                Session {proof.sessionId}
                <br />
                Active care + handoff: completed
                <br />
                Same session: {String(proof.sameSessionAcrossCheckpoints)}
                <br />
                Validated question: {proof.examinerOutputEvents}
                <br />
                Evidence cutoff: event {proof.evidenceCutoffSequence}
              </div>
            </div>
            <div style={{ ...panel, flex: 1 }}>
              <div style={{ fontSize: 25, color: "#f4c278", letterSpacing: 2 }}>
                MULTIPLE SCENARIO PATHS
              </div>
              <div style={{ fontSize: 38, lineHeight: 1.55, marginTop: 35 }}>
                Timely care
                <br />
                Delayed care
                <br />
                Inappropriate-action attempts
              </div>
              <div style={{ fontSize: 24, color: "#a9c9ce", marginTop: 25 }}>
                Final debrief generation remains in development.
              </div>
            </div>
          </div>
        )}
        <div
          style={{
            position: "absolute",
            left: 20,
            top: 15,
            padding: "9px 15px",
            borderRadius: 6,
            background: "#06151ded",
            color: teal,
            fontSize: 23,
          }}
        >
          {label}
        </div>
        {hero && (
          <div
            style={{
              position: "absolute",
              bottom: 35,
              left: 35,
              padding: "17px 24px",
              background: "#06151de8",
              borderLeft: "4px solid #59dcd0",
              fontSize: 34,
            }}
          >
            Practice the decision. See the evidence.
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
