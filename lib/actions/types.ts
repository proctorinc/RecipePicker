export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  data?: Record<string, string | number | boolean | null | undefined>;
};
