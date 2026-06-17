import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "food-picker",
  checkpointing: {
    maxRuntime: "220s",
  },
});
