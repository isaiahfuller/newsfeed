import { Composition } from "remotion";
import { defaultArticle, NewsIntro } from "./NewsIntro";

export const RemotionRoot = () => (
  <Composition
    id="NewsIntro"
    component={NewsIntro}
    durationInFrames={150}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ article: defaultArticle }}
  />
);
