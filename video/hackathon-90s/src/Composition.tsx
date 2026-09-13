import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import captions from "./captions.json";
import { Audio } from "@remotion/media";
import { staticFile } from "remotion";
import { Opening } from "./scenes/Opening";
import { Overview } from "./scenes/Overview";
import { Patient } from "./scenes/Patient";
import { Preparation } from "./scenes/Preparation";
import { Handoff } from "./scenes/Handoff";
import { Architecture } from "./scenes/Architecture";
import { Evidence } from "./scenes/Evidence";
import { Proof } from "./scenes/Proof";
import { Closing } from "./scenes/Closing";
export const DoNoHarm90 = () => {
  const frame = useCurrentFrame();
  const c = captions.find(
    (c) => (frame * 1000) / 30 >= c.startMs && (frame * 1000) / 30 < c.endMs,
  );
  return (
    <AbsoluteFill
      style={{
        background: "#07151d",
        color: "#e6f6f5",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <Sequence name="Opening" durationInFrames={180}>
        <Opening />
      </Sequence>
      <Audio src={staticFile("audio/live-mix.wav")} />
      <Sequence name="Overview" from={180} durationInFrames={180}>
        <Overview />
      </Sequence>
      <Sequence name="Patient" from={360} durationInFrames={420}>
        <Patient />
      </Sequence>
      <Sequence name="Preparation" from={780} durationInFrames={300}>
        <Preparation />
      </Sequence>
      <Sequence name="Handoff" from={1080} durationInFrames={390}>
        <Handoff />
      </Sequence>
      <Sequence name="Architecture" from={1470} durationInFrames={330}>
        <Architecture />
      </Sequence>
      <Sequence name="Evidence" from={1800} durationInFrames={480}>
        <Evidence />
      </Sequence>
      <Sequence name="Proof" from={2280} durationInFrames={270}>
        <Proof />
      </Sequence>
      <Sequence name="Closing" from={2550} durationInFrames={150}>
        <Closing />
      </Sequence>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 34,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 3,
          color: "#59dcd0",
        }}
      >
        GPT LIVE VOICES · DRAMATIZED DIALOGUE
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 71,
          left: 160,
          right: 160,
          minHeight: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontSize: 42,
          lineHeight: 1.22,
          fontWeight: 550,
          whiteSpace: "pre-line",
          padding: "12px 30px",
          background: "#07151deb",
          borderRadius: 10,
        }}
      >
        <div>
          {c && c.role !== "Narrator" && (
            <div
              style={{
                fontSize: 20,
                letterSpacing: 2,
                color: "#59dcd0",
                marginBottom: 6,
              }}
            >
              {c.role.toUpperCase()}
            </div>
          )}
          {c?.text}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 26,
          left: 80,
          fontSize: 23,
          color: "#a5c0c5",
        }}
      >
        Fictional training prototype · clinical content unreviewed
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 27,
          right: 80,
          fontSize: 22,
          color: "#a5c0c5",
        }}
      >
        DO NO HARM / 90s
      </div>
    </AbsoluteFill>
  );
};
