/** lottie-web 的 esm 輕量版沒有附型別，這裡補上我們用到的部分 */
declare module "lottie-web/build/player/esm/lottie_light.min.js" {
  import type { AnimationConfigWithData, AnimationItem } from "lottie-web";

  const lottie: {
    loadAnimation(params: AnimationConfigWithData): AnimationItem;
  };
  export default lottie;
}
