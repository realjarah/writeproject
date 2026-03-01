import type { VoiceAnalysis } from "@/lib/content-types";

export type AccountType = "individual" | "brand";
export type Step =
  | "type"
  | "writing_types"
  | "questions"
  | "samples"
  | "words"
  | "review"
  | "analyzing"
  | "report";

export interface Question {
  id: string;
  prompt: string;
  placeholder: string;
}

export interface AddedSample {
  title: string;
  content: string;
  wordCount: number;
  category: string;
  notes: string;
  inputMethod: "paste" | "url" | "file";
}

export interface AnalyzeStats {
  totalWords: number;
  sampleCount: number;
}

export interface OnboardingState {
  step: Step;
  setStep: (s: Step) => void;
  accountType: AccountType;
  setAccountType: (t: AccountType) => void;
  selectedTypes: string[];
  setSelectedTypes: (fn: (prev: string[]) => string[]) => void;
  answers: Record<string, string>;
  setAnswers: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  samples: AddedSample[];
  setSamples: (fn: (prev: AddedSample[]) => AddedSample[]) => void;
  favoriteWords: string[];
  setFavoriteWords: (fn: (prev: string[]) => string[]) => void;
  questionIndex: number;
  setQuestionIndex: (fn: (prev: number) => number) => void;
  voiceAnalysis: VoiceAnalysis | null;
  setVoiceAnalysis: (v: VoiceAnalysis | null) => void;
  analyzeStats: AnalyzeStats | null;
  setAnalyzeStats: (s: AnalyzeStats | null) => void;
}
