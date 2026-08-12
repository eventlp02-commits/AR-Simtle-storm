import type { Metadata } from "next";
import { SmileStormExperience } from "./components/SmileStormExperience";

export const metadata: Metadata = {
  title: "Smile Storm — 表情驱动 AR 互动实验",
  description: "微笑召唤雨幕，大笑点燃烟花，并用头部撞开粒子。所有识别均在浏览器本地完成。",
};

export default function Home() {
  return <SmileStormExperience />;
}
