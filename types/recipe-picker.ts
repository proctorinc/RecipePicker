export type RecipePickerMode = "v1" | "v2";

export type RecipePickerIntent = "replace_set" | "refine_set" | "add_to_set";

export type RecipePickerCard = {
  recipeId: string;
  title: string;
  imageUrl: string | null;
  siteName: string | null;
  shortDescription: string | null;
  matchedReasons: string[];
  isPinned: boolean;
  averageRating: number | null;
  reviewCount: number;
};

export type RecipePickerRequest = {
  mode: RecipePickerMode;
  prompt: string;
  conversationId?: string | null;
  currentSetRecipeIds: string[];
  pinnedRecipeIds: string[];
  activeRecipeId?: string | null;
};

export type RecipePickerModeAvailability = {
  v1: boolean;
  v2: boolean;
};

export type RecipePickerResponse = {
  conversationId: string;
  activeMessageId: string | null;
  intent: RecipePickerIntent;
  setExplanation: string;
  assistantMessage: string;
  suggestedPrompts: string[];
  recipes: RecipePickerCard[];
  pinnedRecipeIds: string[];
  activeIndex: number;
  requiresAiSetup: boolean;
  modeAvailability: RecipePickerModeAvailability;
  messages: RecipePickerChatMessage[];
  threadSummaries: RecipePickerConversationSummary[];
};

export type RecipePickerInlineRecipeRef = {
  recipeId: string;
  label: string;
};

export type RecipePickerMessageSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "recipe";
      recipeId: string;
      label: string;
    };

export type RecipePickerChatMessage = {
  messageId: string;
  role: "user" | "assistant" | "system";
  bodyText: string;
  intent: RecipePickerIntent | null;
  createdAt: string;
  inlineRecipeRefs: RecipePickerInlineRecipeRef[];
  segments: RecipePickerMessageSegment[];
  recipeSnapshot: RecipePickerCard[] | null;
  pinnedRecipeIds: string[];
  activeRecipeId: string | null;
  suggestedPrompts: string[];
};

export type RecipePickerConversationSummary = {
  conversationId: string;
  title: string;
  preview: string;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};
