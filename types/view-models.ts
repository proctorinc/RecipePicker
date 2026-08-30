export type PinStatus =
  | "recipe_ready"
  | "not_extracted"
  | "extraction_failed"
  | "needs_review"
  | "not_recipe"
  | "removed";

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
  searchMatches: FeedSearchMatch[];
  averageRating: number | null;
  reviewCount: number;
};

export type FeedSearchMatch = {
  tier: 1 | 2 | 3 | 4;
  field:
    | "title"
    | "ingredient"
    | "alias"
    | "family"
    | "description"
    | "site"
    | "website";
  matchedText: string | null;
  relatedText: string | null;
};

export type FeedPinsPage = {
  items: FeedPinCard[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type RecipeTagView = {
  tagId: string;
  name: string;
};

export type RecipeTagCollectionView = RecipeTagView & {
  recipeCount: number;
  previewRecipes: Array<{
    recipeId: string;
    imageUrl: string | null;
    previewImageUrl: string | null;
    dominantColor: string | null;
  }>;
};

export type RecipeReviewAggregate = {
  averageRating: number | null;
  reviewCount: number;
};

export type RecipeReviewView = {
  reviewId: string;
  recipeId: string;
  recipeVersionNumber: number;
  eventId: string | null;
  recipeTitle: string;
  recipeImageUrl: string | null;
  recipePreviewImageUrl: string | null;
  ratingValue: number;
  eatenOn: string | null;
  note: string | null;
  imageUrl: string | null;
  reviewerName: string;
  reviewerClerkUserId: string | null;
  canEdit: boolean;
  canDelete: boolean;
};

export type RecipeVersionView = {
  recipeVersionId: string | null;
  versionNumber: number;
  createdAt: string | null;
  note: string | null;
  isPrimary: boolean;
  ingredients: string[];
  changes: { added: string[]; removed: string[] };
};

export type RecipeHistoryRecipeOption = {
  recipeId: string;
  recipeTitle: string;
  recipeImageUrl: string | null;
  recipePreviewImageUrl: string | null;
  dominantColor: string | null;
  averageRating: number | null;
  reviewCount: number;
};

export type RecipeHistoryEventView = {
  eventId: string;
  recipeId: string;
  recipeTitle: string;
  recipeImageUrl: string | null;
  recipePreviewImageUrl: string | null;
  date: string;
  isPlanned: boolean;
  detailText: string | null;
  review: RecipeReviewView | null;
  canAddReview: boolean;
  canDelete: boolean;
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
  tags: RecipeTagView[];
  folderPath: Array<{
    folderId: string;
    name: string | null;
    sourceType: "board" | "section";
  }>;
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
  previewImageUrl: string | null;
  description: string | null;
  author: string | null;
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
  versions: RecipeVersionView[];
  primaryVersionNumber: number;
  ingredients: Array<{
    id: string;
    originalText: string;
    displayText: string;
    measurements: Array<{
      id: string;
      amountText: string;
      amountValue: number | null;
      amountMaxValue: number | null;
      unit: string;
    }>;
    amount: string | null;
    amountValue: number | null;
    amountMaxValue: number | null;
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
  extractionProvenance: "image" | "video" | null;
  extractionSummary: string | null;
  statusSummary: string;
  statusReason: string | null;
  isFlagged: boolean;
};

export type PublicRecipeDetailView = Pick<
  RecipeDetailView,
  | "recipeId"
  | "title"
  | "imageUrl"
  | "previewImageUrl"
  | "description"
  | "sourceUrl"
  | "dominantColor"
  | "yieldText"
  | "prepTime"
  | "cookTime"
  | "totalTime"
  | "ingredients"
  | "steps"
>;

export type PublicRecipeVersionDetailView = PublicRecipeDetailView & {
  householdName: string;
  versionNumber: number;
  latestVersionNumber: number;
};

export type RecipeFolderTreeNode = {
  folderId: string;
  name: string | null;
  parentFolderId: string | null;
  sourceType: "board" | "section";
  pinterestBoardId: string;
  pinterestSectionId: string | null;
  recipeCount: number;
  children: RecipeFolderTreeNode[];
};

export type CanonicalIngredientOption = {
  canonicalIngredientId: string;
  displayName: string;
  ingredientKind: "family" | "base" | "leaf";
  parentCanonicalIngredientId: string | null;
  parentDisplayName: string | null;
  catalogStatus: "provisional" | "confirmed";
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
  measurements: Array<{ id: string; amountText: string; amountValue: number | null; amountMaxValue: number | null; unit: string }>;
  amountText: string | null;
  unit: string | null;
  notes: string | null;
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
  aiParseOutcome: "parsed" | "not_ingredient" | "unresolved" | null;
  aiParseReason: string | null;
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

export type IngredientCatalogItemView = CanonicalIngredientOption & {
  aliases: string[];
  usageCount: number;
};

export type IngredientCatalogPageView = {
  items: IngredientCatalogItemView[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  query: string;
};

export type BoardSyncSummary = {
  boardId: string;
  name: string | null;
  syncEnabled: boolean;
  pinCount: number;
  lastSyncedAt: string | null;
};

export type RecipeOpsListItem = {
  recipeId: string;
  pinId: string;
  title: string;
  boardId: string;
  status: PinStatus;
  isFlagged: boolean;
  updatedAt: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  statusSummary: string;
  statusReason: string | null;
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
  name: string;
  imageUrl: string | null;
  role: "owner" | "member";
  joinedAt: string;
  isCurrentUser: boolean;
};

export type HouseholdCookRatingView = HouseholdMemberView & {
  ratingCount: number;
  averageRating: number | null;
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

export type ShoppingCartSourceMealView = {
  eventId: string;
  date: string;
  recipeId: string;
  recipeTitle: string;
  recipeImageUrl: string | null;
};

export type ShoppingCartItemView = {
  itemId: string;
  canonicalIngredientId: string | null;
  displayName: string;
  amountText: string | null;
  unit: string | null;
  sourceMeals: ShoppingCartSourceMealView[];
  isAlwaysHave: boolean;
  alternativeOptions: Array<{
    canonicalIngredientId: string | null;
    displayName: string;
  }> | null;
  checked: boolean;
  sortPosition: number;
};

export type AlwaysHaveIngredientView = {
  canonicalIngredientId: string;
  displayName: string;
  enabled: boolean;
};

export type ShoppingCartPageView = {
  cartId: string | null;
  startDate: string | null;
  endDate: string | null;
  selectedDates: string[];
  sourceMeals: ShoppingCartSourceMealView[];
  items: ShoppingCartItemView[];
  alwaysHaves: AlwaysHaveIngredientView[];
  history: Array<{ cartId: string; startDate: string; endDate: string; createdAt: string }>;
};
