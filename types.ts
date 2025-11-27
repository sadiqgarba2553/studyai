export enum ContentType {
  QUIZ = 'QUIZ',
  FLASHCARDS = 'FLASHCARDS',
  SUMMARY = 'SUMMARY'
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface Flashcard {
  front: string;
  back: string;
  hint?: string;
}

export interface StudySet {
  id: string;
  title: string;
  type: ContentType;
  createdAt: number;
  content: QuizQuestion[] | Flashcard[] | string; // Type union based on ContentType
  score?: number; // Only for completed quizzes
  mastery?: number; // 0-100 percentage
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface UserStats {
  xp: number;
  streakDays: number;
  itemsCreated: number;
  quizzesTaken: number;
  lastStudyDate?: number;
}

export interface Mistake {
  id: string;
  question: string;
  correctAnswer: string;
  userAnswer?: string;
  topic: string;
  timestamp: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export type View = 'DASHBOARD' | 'CREATE' | 'STUDY_QUIZ' | 'STUDY_FLASHCARDS' | 'CHAT' | 'SUMMARY' | 'ANALYZE_IMAGE' | 'TTS';