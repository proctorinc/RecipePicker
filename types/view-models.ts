export type PinStatus =
  | "recipe_ready"
  | "not_extracted"
  | "extraction_failed"
  | "needs_review"
  | "not_recipe";

export type FeedPinCard = {
  recipeId: string;
  pinId: string;
  title: string;
  imageUrl: string | null;
  previewImageUrl: string | null;
  dominantColor: string | null;
  destinationHref: string;
  siteName: string | null;
  status: PinStatus;
  hasRecipe: boolean;
  searchText: string;
  averageRating: number | null;
  reviewCount: number;
};

export type FeedPinsPage = {
  items: FeedPinCard[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type RecipeReviewAggregate = {
  averageRating: number | null;
  reviewCount: number;
};

export type RecipeReviewView = {
  reviewId: string;
  recipeId: string;
  eventId: string | null;
  recipeTitle: string;
  recipeImageUrl: string | null;
  ratingValue: number;
  eatenOn: string | null;
  note: string | null;
  reviewerName: string;
  reviewerClerkUserId: string | null;
  canEdit: boolean;
  canDelete: boolean;
};

export type RecipeHistoryRecipeOption = {
  recipeId: string;
  recipeTitle: string;
  recipeImageUrl: string | null;
};

export type RecipeHistoryEventView = {
  eventId: string;
  recipeId: string;
  recipeTitle: string;
  recipeImageUrl: string | null;
  date: string;
  isPlanned: boolean;
  detailText: string | null;
  review: RecipeReviewView | null;
  canAddReview: boolean;
};

export type RecipeHistoryDayView = {
  date: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  events: RecipeHistoryEventView[];
};

export type RecipeDetailView = {
  recipeId: string;
  pin: {
    link: string | null;
    householdId: string;
    createdAt: string | null;
    updatedAt: string;
    pinterestBoardId: string;
    boardId: string;
    description: string | null;
    rawJson: string;
    pinId: string;
    pinterestPinId: string;
    boardSectionId: string | null;
    title: string | null;
    altText: string | null;
    dominantColor: string | null;
    note: string | null;
    parentPinId: string | null;
    mediaJson: string | null;
    mediaSourceJson: string | null;
    creatorJson: string | null;
    boardOwnerJson: string | null;
  };
  title: string;
  imageUrl: string | null;
  description: string | null;
  siteName: string | null;
  sourceUrl: string | null;
  status: PinStatus;
  dominantColor: string | null;
  yieldText: string | null;
  prepTime: string | null;
  cookTime: string | null;
  totalTime: string | null;
  averageRating: number | null;
  reviewCount: number;
  reviews: RecipeReviewView[];
  ingredients: Array<{
    id: string;
    originalText: string;
    displayText: string;
    amount: string | null;
    unit: string | null;
    parsedText: string | null;
    notes: string | null;
    canonicalIngredientId: string | null;
    canonicalName: string | null;
    attributes: string[];
    normalizationStatus: "auto_matched" | "needs_review" | "confirmed";
  }>;
  steps: Array<{
    id: string;
    section: string | null;
    text: string;
  }>;
  extractionSummary: string | null;
};

export type CanonicalIngredientOption = {
  canonicalIngredientId: string;
  displayName: string;
  ingredientKind: "family" | "base" | "leaf";
  parentCanonicalIngredientId: string | null;
  parentDisplayName: string | null;
};

export type IngredientReviewSuggestionView = {
  action: "match_existing" | "create_new" | "keep_unresolved";
  canonicalIngredientId: string | null;
  canonicalName: string | null;
  newCanonicalName: string | null;
  parentCanonicalIngredientId: string | null;
  parentCanonicalName: string | null;
  ingredientKind: "family" | "base" | "leaf" | null;
  attributes: string[];
  confidence: number;
  reason: string;
};

export type IngredientReviewItemView = {
  ingredientId: string;
  recipeId: string;
  recipeTitle: string;
  originalText: string;
  parsedIngredientText: string | null;
  normalizedIngredientPhrase: string | null;
  suggestedCanonicalIngredientId: string | null;
  suggestedCanonicalName: string | null;
  suggestedParentCanonicalIngredientId: string | null;
  suggestedParentCanonicalName: string | null;
  suggestedAction: "match_existing" | "create_new" | "keep_unresolved";
  suggestedIngredientKind: "family" | "base" | "leaf" | null;
  suggestedAttributes: string[];
  matchConfidence: number | null;
  matchedBy: string | null;
  aiSuggestions: IngredientReviewSuggestionView[];
  occurrenceCount: number;
  sourceUrl: string | null;
};

export type IngredientReviewQueuePageView = {
  items: IngredientReviewItemView[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type BoardSyncSummary = {
  boardId: string;
  name: string | null;
  syncEnabled: boolean;
  pinCount: number;
  recipeCount: number;
  pendingCount: number;
  failedCount: number;
  reviewCount: number;
  lastSyncedAt: string | null;
};

export type RecipeOpsListItem = {
  recipeId: string;
  pinId: string;
  title: string;
  boardId: string;
  status: PinStatus;
  updatedAt: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
};

export type RecipeParseJobStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "completed"
  | "cancelled";

export type RecipeParseJobItemStatus =
  | "queued"
  | "processing"
  | "extracted"
  | "review_needed"
  | "failed"
  | "cancelled";

export type RecipeParseJobSummary = {
  jobId: string;
  status: RecipeParseJobStatus;
  requestedByLabel: string;
  totalRecipes: number;
  processedRecipes: number;
  succeededRecipes: number;
  reviewNeededRecipes: number;
  failedRecipes: number;
  cancelledRecipes: number;
  percentComplete: number;
  rerun: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelRequestedAt: string | null;
  lastHeartbeatAt: string | null;
  lastError: string | null;
  currentPhase: string;
  canCancel: boolean;
  canResume: boolean;
};

export type RecipeParseJobDetail = RecipeParseJobSummary & {
  items: Array<{
    jobItemId: string;
    recipeId: string;
    title: string;
    status: RecipeParseJobItemStatus;
    attemptCount: number;
    startedAt: string | null;
    completedAt: string | null;
    lastError: string | null;
    lastExtractionId: string | null;
  }>;
};

export type RecipeExtractionFeedbackCategory =
  | "missing_ingredients"
  | "missing_steps"
  | "wrong_order"
  | "wrong_recipe_selected"
  | "formatting_only"
  | "source_problem"
  | "other";

export type RecipeOpsDetail = {
  recipeId: string;
  pinId: string;
  title: string;
  boardId: string;
  status: PinStatus;
  imageUrl: string | null;
  sourceUrl: string | null;
  latestPagePreviewDataUrl: string | null;
  recipeSummary: string | null;
  plainLanguageStatus: string;
  actionableIssues: string[];
  recommendedNextStep: string;
  latestAttentionReason: string | null;
  hasRecipeContent: boolean;
  ingredientReviewCount: number;
  latestFetchStatus: string | null;
  latestFetchAt: string | null;
  latestExtractionStatus: string | null;
  latestExtractionMethod: string | null;
  latestFetchStrategy: string | null;
  latestContentVariant: string | null;
  latestExtractionStrategy: string | null;
  latestQualityScore: number | null;
  latestConfidence: string | null;
  latestLowConfidence: boolean;
  latestFailureReason: string | null;
  latestQualitySignals: Record<string, unknown> | null;
  latestExtractionWarnings: string[];
  latestExtractionPayload: Record<string, unknown> | null;
  recipeFeedback: {
    feedbackId: string;
    summary: string | null;
    note: string | null;
    updatedAt: string;
  } | null;
  latestRunFeedback: Array<{
    feedbackId: string;
    extractionId: string | null;
    category: RecipeExtractionFeedbackCategory;
    note: string;
    createdAt: string;
  }>;
  ingredients: Array<{
    id: string;
    amount: string | null;
    unit: string | null;
    originalText: string;
    parsedText: string | null;
    notes: string | null;
    canonicalIngredientId: string | null;
    canonicalName: string | null;
    parentCanonicalIngredientId: string | null;
    parentCanonicalName: string | null;
    ingredientKind: "family" | "base" | "leaf" | null;
    attributes: string[];
    matchConfidence: number | null;
    matchedBy: string | null;
    normalizationStatus: "auto_matched" | "needs_review" | "confirmed";
  }>;
  steps: Array<{
    id: string;
    section: string | null;
    text: string;
  }>;
  latestAttempts: Array<{
    attemptId: string;
    createdAt: string;
    status: string;
    method: string | null;
    fetchStrategy: string;
    contentVariant: string | null;
    extractionStrategy: string | null;
    qualityScore: number | null;
    confidence: string | null;
    selected: boolean;
    failureReason: string | null;
    warnings: string[];
    qualitySignals: Record<string, unknown> | null;
    payload: Record<string, unknown> | null;
  }>;
  history: Array<{
    extractionId: string;
    createdAt: string;
    status: string;
    method: string | null;
    fetchStrategy: string | null;
    contentVariant: string | null;
    extractionStrategy: string | null;
    qualityScore: number | null;
    confidence: string | null;
    lowConfidence: boolean;
    failureReason: string | null;
    warnings: string[];
    qualitySignals: Record<string, unknown> | null;
    payload: Record<string, unknown> | null;
    summary: string;
    feedback: Array<{
      feedbackId: string;
      category: RecipeExtractionFeedbackCategory;
      note: string;
      createdAt: string;
    }>;
    attempts: Array<{
      attemptId: string;
      createdAt: string;
      status: string;
      method: string | null;
      fetchStrategy: string;
      contentVariant: string | null;
      extractionStrategy: string | null;
      qualityScore: number | null;
      confidence: string | null;
      selected: boolean;
      failureReason: string | null;
      warnings: string[];
      qualitySignals: Record<string, unknown> | null;
      payload: Record<string, unknown> | null;
    }>;
  }>;
};

export type DashboardSummary = {
  totalPins: number;
  totalRecipes: number;
  pendingRecipes: number;
  failedRecipes: number;
  reviewNeeded: number;
  boardsTracked: number;
};

export type HouseholdMemberView = {
  clerkUserId: string;
  role: "owner" | "member";
  joinedAt: string;
  isCurrentUser: boolean;
};

export type RecipeHistoryPageView = {
  month: string;
  monthLabel: string;
  previousMonth: string;
  nextMonth: string;
  days: RecipeHistoryDayView[];
  recipeOptions: RecipeHistoryRecipeOption[];
  selectedRecipe: RecipeHistoryRecipeOption | null;
};
