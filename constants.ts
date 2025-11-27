import { UserStats, StudySet, ContentType } from './types';

export const APP_NAME = "StudyAI";

export const MOCK_USER_STATS: UserStats = {
  xp: 1250,
  streakDays: 4,
  itemsCreated: 12,
  quizzesTaken: 8,
  lastStudyDate: Date.now() - 86400000 // Yesterday
};

export const MOCK_RECENT_SETS: StudySet[] = [
  {
    id: '1',
    title: 'Photosynthesis Basics',
    type: ContentType.QUIZ,
    createdAt: Date.now() - 1000000,
    content: [],
    score: 85,
    mastery: 85
  },
  {
    id: '2',
    title: 'European History 1900s',
    type: ContentType.FLASHCARDS,
    createdAt: Date.now() - 2000000,
    content: [],
    mastery: 40
  }
];

export const TOPICS_SUGGESTIONS = [
  "Quantum Mechanics for Beginners",
  "The French Revolution",
  "React Hooks vs Classes",
  "Introduction to Macroeconomics",
  "Cellular Respiration"
];