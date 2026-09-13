import "./index.css";
import { Composition, Still } from "remotion";
import { DoNoHarm90 } from "./Composition";
export const RemotionRoot = () => (
  <>
    <Composition
      id="DoNoHarm90"
      component={DoNoHarm90}
      durationInFrames={2700}
      fps={30}
      width={1920}
      height={1080}
    />
    <Still id="Thumbnail" component={DoNoHarm90} width={1920} height={1080} />
  </>
);
