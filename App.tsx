import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Plus, 
  BookOpen, 
  MessageSquare, 
  Settings, 
  BrainCircuit, 
  Trophy, 
  Flame, 
  ChevronRight, 
  X,
  Play,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Zap,
  ArrowRight,
  Send,
  Loader2,
  FileText,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  Mic,
  Upload,
  LogOut,
  User as UserIcon,
  Lock,
  Mail,
  Database,
  Globe,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Copy
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Button, Card, Badge } from './components/UI';
import { 
  generateQuiz, 
  generateFlashcards, 
  generateSummary, 
  generateRevisionQuiz, 
  createChatSession,
  analyzeImage,
  generateSpeech
} from './services/geminiService';
import { StudySet, ContentType, QuizQuestion, Flashcard, UserStats, ChatMessage, Mistake, View, User } from './types';
import { MOCK_USER_STATS, MOCK_RECENT_SETS, TOPICS_SUGGESTIONS } from './constants';

// Firebase Imports
import { auth, db, isFirebaseConfigured, googleProvider } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut,
  updateProfile,
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  getDoc
} from 'firebase/firestore';

// --- UTILS ---
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

const playRawAudio = async (base64Audio: string) => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const dataInt16 = new Int16Array(bytes.buffer);
  const numChannels = 1;
  const frameCount = dataInt16.length / numChannels;
  const buffer = audioContext.createBuffer(numChannels, frameCount, 24000);
  
  for (let channel = 0; channel < numChannels; channel++) {
     const channelData = buffer.getChannelData(channel);
     for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
     }
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
};

const calculateStreak = (currentStats: UserStats): number => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  const lastDate = currentStats.lastStudyDate ? new Date(currentStats.lastStudyDate) : new Date(0);
  const lastDateMidnight = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate()).getTime();
  
  const oneDay = 24 * 60 * 60 * 1000;

  if (today === lastDateMidnight) {
    return currentStats.streakDays; // Already studied today
  } else if (today - lastDateMidnight === oneDay) {
    return currentStats.streakDays + 1; // Consecutive day
  } else {
    return 1; // Reset streak or start new
  }
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('DASHBOARD');
  const [activeSet, setActiveSet] = useState<StudySet | null>(null);
  const [userStats, setUserStats] = useState<UserStats>(MOCK_USER_STATS);
  const [mySets, setMySets] = useState<StudySet[]>([]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [isRevisionLoading, setIsRevisionLoading] = useState(false);
  
  // Error States
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // Check Gemini API Key
  useEffect(() => {
    if (!process.env.API_KEY) {
      setApiKeyMissing(true);
    }
  }, []);

  // Firebase Auth Observer
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Scholar',
          email: firebaseUser.email || ''
        });
      } else {
        setUser(null);
        // Reset state on logout
        setUserStats(MOCK_USER_STATS);
        setMySets([]);
        setMistakes([]);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load User Data from Firestore
  useEffect(() => {
    if (!user || !isFirebaseConfigured || !db) return;

    // Real-time listener for user document
    const userDocRef = doc(db, 'users', user.id);
    
    // Add error callback to handle permission denied errors gracefully
    const unsubscribe = onSnapshot(userDocRef, 
      (docSnap) => {
        setFirestoreError(null); // Clear previous errors on success
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && data.stats) setUserStats(data.stats);
          if (data && data.sets) setMySets(data.sets);
          if (data && data.mistakes) setMistakes(data.mistakes);
        } else {
          // Create initial doc if it doesn't exist
          setDoc(userDocRef, {
            email: user.email,
            name: user.name,
            stats: MOCK_USER_STATS,
            sets: [],
            mistakes: []
          }, { merge: true }).catch(err => {
             console.error("Error creating initial user doc:", err);
             // Don't set global error here to avoid blocking UI for simple write errors
          });
        }
      },
      (error) => {
        console.error("Firestore Snapshot Error:", error);
        if (error.code === 'permission-denied') {
          setFirestoreError("Permission denied. If you are setting up, your rules might be too restrictive or haven't propagated.");
        } else {
          setFirestoreError(`Database Sync Error: ${error.message}`);
        }
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Save Data to Firestore (Debounced or on significant actions)
  const saveUserData = async (newStats?: UserStats, newSets?: StudySet[], newMistakes?: Mistake[]) => {
    if (!user || !isFirebaseConfigured || !db) return;
    
    try {
      const userDocRef = doc(db, 'users', user.id);
      const updatePayload: any = {};
      if (newStats) updatePayload.stats = newStats;
      if (newSets) updatePayload.sets = newSets;
      if (newMistakes) updatePayload.mistakes = newMistakes;

      await setDoc(userDocRef, updatePayload, { merge: true });
    } catch (e: any) {
      console.error("Error saving to firestore", e);
      // We don't block the UI for save errors, but we log them
    }
  };

  const handleLogout = async () => {
    try {
      if (auth) await signOut(auth);
      // State is cleared in onAuthStateChanged
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const handleCreateSet = async (newSet: StudySet) => {
    const updatedSets = [newSet, ...mySets];
    
    const newStreak = calculateStreak(userStats);
    
    const updatedStats = {
      ...userStats,
      itemsCreated: userStats.itemsCreated + 1,
      xp: userStats.xp + 50,
      streakDays: newStreak,
      lastStudyDate: Date.now()
    };

    // Optimistic Update
    setMySets(updatedSets);
    setUserStats(updatedStats);
    
    setActiveSet(newSet);
    if (newSet.type === ContentType.QUIZ) setCurrentView('STUDY_QUIZ');
    else if (newSet.type === ContentType.FLASHCARDS) setCurrentView('STUDY_FLASHCARDS');
    else if (newSet.type === ContentType.SUMMARY) setCurrentView('SUMMARY');

    // Persist
    await saveUserData(updatedStats, updatedSets);
  };

  const handleSetComplete = async (score: number, newMistakes: Mistake[] = [], xpChange: number) => {
    const newStreak = calculateStreak(userStats);

    const updatedStats = {
      ...userStats,
      xp: Math.max(0, userStats.xp + xpChange), // Ensure XP doesn't go below 0
      quizzesTaken: userStats.quizzesTaken + 1,
      streakDays: newStreak,
      lastStudyDate: Date.now()
    };
    
    let updatedMistakes = mistakes;
    if (newMistakes.length > 0) {
      updatedMistakes = [...mistakes, ...newMistakes];
    }

    // Optimistic Update
    setUserStats(updatedStats);
    setMistakes(updatedMistakes);

    // Persist
    await saveUserData(updatedStats, undefined, updatedMistakes);
  };

  const handleStartRevision = async () => {
    if (mistakes.length === 0) return;
    setIsRevisionLoading(true);
    try {
      const recentMistakes = mistakes.slice(-10);
      const revisionQuestions = await generateRevisionQuiz(recentMistakes);
      
      const revisionSet: StudySet = {
        id: `rev-${Date.now()}`,
        title: `Smart Revision - ${new Date().toLocaleDateString()}`,
        type: ContentType.QUIZ,
        createdAt: Date.now(),
        content: revisionQuestions,
        mastery: 0
      };

      const updatedSets = [revisionSet, ...mySets];
      
      const usedIds = new Set(recentMistakes.map(m => m.id));
      const updatedMistakes = mistakes.filter(m => !usedIds.has(m.id));

      setMySets(updatedSets);
      setMistakes(updatedMistakes);
      setActiveSet(revisionSet);
      setCurrentView('STUDY_QUIZ');

      await saveUserData(undefined, updatedSets, updatedMistakes);

    } catch (error) {
      console.error("Failed to generate revision", error);
      alert("Could not generate revision quiz. Please try again.");
    } finally {
      setIsRevisionLoading(false);
    }
  };

  const RECOMMENDED_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`;

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Database className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-xl font-bold mb-2">Firebase Setup Required</h1>
          <p className="text-slate-600 mb-6 text-sm">
            To enable real login and data persistence, you must configure your Firebase project. 
            Open <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono">firebase.ts</code> and add your project keys.
          </p>
        </Card>
      </div>
    );
  }

  if (apiKeyMissing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold mb-2">API Key Missing</h1>
          <p className="text-slate-600 mb-4">
            StudyAI requires a Google Gemini API key to function. Please ensure <code className="bg-slate-100 px-1 py-0.5 rounded text-sm">process.env.API_KEY</code> is set.
          </p>
        </Card>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  // Auth Guard
  if (!user) {
    return <AuthView />;
  }

  return (
    <div className="flex min-h-screen bg-[#F0F4F8] text-slate-900 font-sans selection:bg-blue-200">
      {/* Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 glass-panel border-r border-white/40 fixed h-full z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <BrainCircuit className="text-white w-6 h-6" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-800">StudyAI</span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <NavItem 
            icon={<LayoutDashboard />} 
            label="Dashboard" 
            active={currentView === 'DASHBOARD'} 
            onClick={() => setCurrentView('DASHBOARD')} 
          />
          <NavItem 
            icon={<Plus />} 
            label="Create New" 
            active={currentView === 'CREATE'} 
            onClick={() => setCurrentView('CREATE')} 
          />
          <NavItem 
            icon={<MessageSquare />} 
            label="AI Assistant" 
            active={currentView === 'CHAT'} 
            onClick={() => setCurrentView('CHAT')} 
          />

          <div className="pt-6 pb-2 px-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tools</p>
          </div>
          <NavItem 
            icon={<ImageIcon />} 
            label="Analyze Image" 
            active={currentView === 'ANALYZE_IMAGE'} 
            onClick={() => setCurrentView('ANALYZE_IMAGE')} 
          />
          <NavItem 
            icon={<Mic />} 
            label="Text to Speech" 
            active={currentView === 'TTS'} 
            onClick={() => setCurrentView('TTS')} 
          />
          
          <div className="pt-6 pb-2 px-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">My Library</p>
          </div>
          <div className="space-y-1 overflow-y-auto max-h-[300px] custom-scrollbar">
            {mySets.map(set => (
              <button
                key={set.id}
                onClick={() => {
                  setActiveSet(set);
                  if (set.type === ContentType.QUIZ) setCurrentView('STUDY_QUIZ');
                  else if (set.type === ContentType.FLASHCARDS) setCurrentView('STUDY_FLASHCARDS');
                  else if (set.type === ContentType.SUMMARY) setCurrentView('SUMMARY');
                }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${activeSet?.id === set.id ? 'bg-white/60 text-blue-700 font-medium' : 'text-slate-600 hover:bg-white/40'}`}
              >
                {set.type === ContentType.QUIZ ? <CheckCircle size={14} /> : <BookOpen size={14} />}
                <span className="truncate">{set.title}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="p-4 border-t border-white/30 space-y-4">
          <Card className="!p-3 !bg-gradient-to-br !from-blue-600 !to-indigo-600 !text-white !border-none">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium opacity-90">Level {Math.floor(userStats.xp / 1000) + 1} Scholar</span>
              <Trophy size={14} />
            </div>
            <div className="w-full bg-white/20 rounded-full h-1.5 mb-2">
              <div className="bg-white h-1.5 rounded-full" style={{ width: `${Math.min((userStats.xp % 1000) / 10, 100)}%` }}></div>
            </div>
            <div className="text-xs opacity-80">{userStats.xp} XP Earned</div>
          </Card>

          <div className="flex items-center justify-between px-2">
             <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                 {user.name.charAt(0).toUpperCase()}
               </div>
               <div className="flex flex-col">
                 <span className="text-xs font-bold text-slate-700 truncate max-w-[80px]">{user.name}</span>
                 <span className="text-[10px] text-slate-500 truncate max-w-[80px]">{user.email}</span>
               </div>
             </div>
             <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors" title="Logout">
               <LogOut size={16} />
             </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto h-screen relative">
        {/* Firestore Error Banner */}
        {firestoreError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 animate-in slide-in-from-top-2">
            <div className="flex items-start gap-3 mb-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="font-bold">Database Connection Issue</p>
                <p>{firestoreError}</p>
              </div>
              <button onClick={() => setFirestoreError(null)} className="text-red-500 hover:text-red-700"><X size={16}/></button>
            </div>
            
            {/* Rule Helper */}
            {firestoreError.includes('Permission') && (
               <div className="ml-8 mt-2">
                 <p className="text-xs font-semibold mb-1 opacity-80">RECOMMENDED FIRESTORE RULES:</p>
                 <div className="relative group">
                   <pre className="bg-slate-900 text-slate-300 p-3 rounded-lg text-xs font-mono overflow-x-auto border border-red-200">
                     {RECOMMENDED_RULES}
                   </pre>
                   <button 
                     onClick={() => navigator.clipboard.writeText(RECOMMENDED_RULES)}
                     className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                     title="Copy Rules"
                   >
                     <Copy size={12} />
                   </button>
                 </div>
                 <p className="text-[10px] mt-1 text-red-600 opacity-80">
                   Go to Firebase Console &gt; Firestore &gt; Rules and paste the above to secure your app.
                 </p>
               </div>
            )}
          </div>
        )}

        {/* Header Mobile */}
        <div className="md:hidden flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BrainCircuit className="text-blue-600 w-6 h-6" />
            <span className="font-bold text-lg">StudyAI</span>
          </div>
          <Button size="sm" onClick={() => setCurrentView('DASHBOARD')}>Home</Button>
        </div>

        {/* View Switcher */}
        {currentView === 'DASHBOARD' && (
          <DashboardView 
            userStats={userStats} 
            sets={mySets}
            mistakes={mistakes} 
            isRevisionLoading={isRevisionLoading}
            onCreateClick={() => setCurrentView('CREATE')}
            onStartRevision={handleStartRevision}
            onSetSelect={(set) => {
               setActiveSet(set);
               if (set.type === ContentType.QUIZ) setCurrentView('STUDY_QUIZ');
               else if (set.type === ContentType.FLASHCARDS) setCurrentView('STUDY_FLASHCARDS');
               else if (set.type === ContentType.SUMMARY) setCurrentView('SUMMARY');
            }}
            userName={user.name}
          />
        )}
        {currentView === 'CREATE' && <CreateView onCreated={handleCreateSet} onCancel={() => setCurrentView('DASHBOARD')} />}
        {currentView === 'ANALYZE_IMAGE' && <AnalyzeImageView />}
        {currentView === 'TTS' && <TTSView />}
        {currentView === 'STUDY_QUIZ' && activeSet && (
           <QuizPlayer 
             set={activeSet} 
             onComplete={handleSetComplete} 
             onExit={() => setCurrentView('DASHBOARD')} 
           />
        )}
        {currentView === 'STUDY_FLASHCARDS' && activeSet && (
          <FlashcardPlayer 
            set={activeSet} 
            onExit={() => setCurrentView('DASHBOARD')} 
          />
        )}
        {currentView === 'SUMMARY' && activeSet && (
          <SummaryViewer
            set={activeSet}
            onExit={() => setCurrentView('DASHBOARD')}
          />
        )}
        {currentView === 'CHAT' && <ChatView />}
      </main>
    </div>
  );
}

// --- AUTH COMPONENT ---

function AuthView() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      if (!auth) throw new Error("Authentication service not initialized");
      
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (userCredential.user) {
          await updateProfile(userCredential.user, {
            displayName: name
          });
          // Create initial user doc
          if (db) {
            await setDoc(doc(db, 'users', userCredential.user.uid), {
              name: name,
              email: email,
              stats: MOCK_USER_STATS,
              sets: [],
              mistakes: []
            });
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential') {
        setError("Invalid email or password.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("Email already in use.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else if (err.code === 'auth/operation-not-supported-in-this-environment') {
        setError("Authentication is not supported in this environment (likely due to strict browser privacy settings or preview restrictions).");
      } else {
        setError(err.message || "Authentication failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (!auth || !googleProvider) throw new Error("Auth service not available");
      
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user && db) {
         // Create user doc if not exists
         const userRef = doc(db, 'users', result.user.uid);
         try {
           const docSnap = await getDoc(userRef);
           if (!docSnap.exists()) {
             await setDoc(userRef, {
               name: result.user.displayName || 'Scholar',
               email: result.user.email,
               stats: MOCK_USER_STATS,
               sets: [],
               mistakes: []
             });
           }
         } catch (dbErr) {
           console.error("Firestore init error during login:", dbErr);
           // Proceed anyway, we'll catch firestore errors in the main app
         }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-supported-in-this-environment') {
        setError("Google Sign-In is not supported in this restricted environment (e.g. embedded preview). Please try the Email/Password method or open the app in a full browser tab.");
      } else if (err.code === 'auth/popup-blocked') {
         setError("Popup was blocked. Please allow popups for this site.");
      } else {
        setError("Google sign in failed. " + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8] p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-300 rounded-full blur-[100px] opacity-20"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-300 rounded-full blur-[100px] opacity-20"></div>
      </div>

      <div className="w-full max-w-md z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
         <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 mx-auto mb-4">
              <BrainCircuit className="text-white w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">StudyAI</h1>
            <p className="text-slate-500">Master your future with Gemini Intelligence</p>
         </div>

         <Card className="!p-8 shadow-xl">
           <div className="flex items-center justify-center gap-4 mb-6">
             <button 
               onClick={() => { setIsLogin(true); setError(''); }}
               className={`text-sm font-medium pb-2 border-b-2 transition-all ${isLogin ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
             >
               Login
             </button>
             <button 
               onClick={() => { setIsLogin(false); setError(''); }}
               className={`text-sm font-medium pb-2 border-b-2 transition-all ${!isLogin ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
             >
               Sign Up
             </button>
           </div>
            
           {/* Google Login Button */}
           <div className="mb-6">
             <button
               type="button"
               onClick={handleGoogleLogin}
               disabled={isLoading}
               className="w-full flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 font-medium py-2.5 rounded-xl transition-all shadow-sm"
             >
               <Globe className="w-4 h-4 text-blue-500" />
               Sign in with Google
             </button>
             <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-400">Or continue with email</span>
                </div>
             </div>
           </div>

           <form onSubmit={handleSubmit} className="space-y-4">
             {!isLogin && (
               <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                 <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                 <div className="relative">
                   <UserIcon className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                   <input 
                     type="text" 
                     required
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                     placeholder="John Doe"
                   />
                 </div>
               </div>
             )}

             <div className="space-y-1">
               <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
               <div className="relative">
                 <Mail className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                 <input 
                   type="email" 
                   required
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                   placeholder="john@example.com"
                 />
               </div>
             </div>

             <div className="space-y-1">
               <label className="text-xs font-bold text-slate-500 uppercase">Password</label>
               <div className="relative">
                 <Lock className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                 <input 
                   type="password" 
                   required
                   value={password}
                   onChange={(e) => setPassword(e.target.value)}
                   className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                   placeholder="••••••••"
                 />
               </div>
             </div>

             {error && (
               <div className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100 flex items-start">
                 <AlertCircle size={12} className="mr-1 mt-0.5 flex-shrink-0"/> 
                 <span>{error}</span>
               </div>
             )}

             <Button 
               type="submit" 
               className="w-full mt-2" 
               size="lg"
               isLoading={isLoading}
             >
               {isLogin ? 'Sign In' : 'Create Account'}
             </Button>
           </form>

           <div className="mt-6 text-center">
             <p className="text-xs text-slate-400">
               By continuing, you agree to our Terms of Service and Privacy Policy.
             </p>
           </div>
         </Card>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
        active 
          ? 'bg-white shadow-sm text-blue-600' 
          : 'text-slate-600 hover:bg-white/40 hover:text-slate-900'
      }`}
    >
      {React.cloneElement(icon as React.ReactElement<any>, { size: 20 })}
      {label}
    </button>
  );
}

// 1. DASHBOARD VIEW
function DashboardView({ userStats, sets, mistakes, isRevisionLoading, onCreateClick, onStartRevision, onSetSelect, userName }: { 
  userStats: UserStats, 
  sets: StudySet[], 
  mistakes: Mistake[],
  isRevisionLoading: boolean,
  onCreateClick: () => void,
  onStartRevision: () => void,
  onSetSelect: (set: StudySet) => void,
  userName: string
}) {
  const data = [
    { name: 'Mon', score: 65 },
    { name: 'Tue', score: 70 },
    { name: 'Wed', score: 68 },
    { name: 'Thu', score: 85 },
    { name: 'Fri', score: 82 },
    { name: 'Sat', score: 90 },
    { name: 'Sun', score: 95 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Welcome back, {userName}</h1>
          <p className="text-slate-500 mt-1">You're on a {userStats.streakDays} day streak! Keep it up.</p>
        </div>
        <div className="flex gap-3">
           <Button onClick={onCreateClick} className="shadow-blue-500/20 shadow-lg">
              <Plus className="mr-2 h-4 w-4" /> Create New
           </Button>
        </div>
      </div>

      {/* Smart Revision Banner */}
      {mistakes.length > 0 && (
        <div className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Sparkles size={120} />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge color="purple" ><span className="text-indigo-900 font-bold flex items-center gap-1"><Sparkles size={12}/> Smart Mode</span></Badge>
              </div>
              <h3 className="text-2xl font-bold mb-1">Time for Smart Revision?</h3>
              <p className="text-indigo-100 max-w-lg">
                We've identified {mistakes.length} concepts you're struggling with. 
                StudyAI can generate a personalized revision quiz to help you master them.
              </p>
            </div>
            <Button 
              onClick={onStartRevision}
              disabled={isRevisionLoading}
              className="bg-white text-indigo-600 hover:bg-indigo-50 border-none shadow-none whitespace-nowrap"
            >
               {isRevisionLoading ? (
                 <>
                   <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...
                 </>
               ) : (
                 <>
                   <Zap className="w-4 h-4 mr-2" /> Start Revision Session
                 </>
               )}
            </Button>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-orange-100 text-orange-600">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Day Streak</p>
            <p className="text-2xl font-bold text-slate-800">{userStats.streakDays}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-blue-100 text-blue-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Quizzes Taken</p>
            <p className="text-2xl font-bold text-slate-800">{userStats.quizzesTaken}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-purple-100 text-purple-600">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Study Sets</p>
            <p className="text-2xl font-bold text-slate-800">{sets.length}</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart */}
        <div className="lg:col-span-2">
          <Card className="h-full min-h-[300px]">
            <h3 className="text-lg font-bold mb-6">Learning Progress</h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#2563eb" 
                    strokeWidth={3} 
                    dot={{fill: '#2563eb', strokeWidth: 2, r: 4, stroke: '#fff'}} 
                    activeDot={{r: 6}} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Recent Sets */}
        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Recent Sets</h3>
            <button className="text-sm text-blue-600 font-medium hover:underline">View All</button>
          </div>
          {sets.length > 0 ? (
            <div className="space-y-4">
              {sets.slice(0, 4).map(set => (
                <Card key={set.id} onClick={() => onSetSelect(set)} className="!p-4 group">
                  <div className="flex justify-between items-start mb-2">
                    <Badge color={set.type === ContentType.QUIZ ? 'blue' : set.type === ContentType.FLASHCARDS ? 'purple' : 'green'}>
                      {set.type}
                    </Badge>
                    <ChevronRight size={16} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <h4 className="font-semibold text-slate-800 mb-1 truncate">{set.title}</h4>
                  <p className="text-xs text-slate-500">
                    {new Date(set.createdAt).toLocaleDateString()} • {Array.isArray(set.content) ? set.content.length : 1} Items
                  </p>
                </Card>
              ))}
            </div>
          ) : (
            <div className="h-40 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400">
               <BookOpen className="w-8 h-8 mb-2 opacity-50"/>
               <p className="text-sm">No sets created yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 2. GENERATOR VIEW
function CreateView({ onCreated, onCancel }: { onCreated: (set: StudySet) => void, onCancel: () => void }) {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<ContentType>(ContentType.QUIZ);
  const [difficulty, setDifficulty] = useState('Medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim() && !selectedFile) return;
    setIsGenerating(true);
    setError('');

    try {
      let content: any;
      
      let fileData;
      if (selectedFile) {
        const base64 = await fileToBase64(selectedFile);
        fileData = {
          mimeType: selectedFile.type,
          data: base64
        };
      }

      if (mode === ContentType.QUIZ) {
        content = await generateQuiz(topic, difficulty, numQuestions, fileData);
      } else if (mode === ContentType.FLASHCARDS) {
        content = await generateFlashcards(topic); 
      } else {
        content = await generateSummary(topic);
      }

      const newSet: StudySet = {
        id: Date.now().toString(),
        title: topic || selectedFile?.name || "Generated Content",
        type: mode,
        createdAt: Date.now(),
        content: content,
        mastery: 0
      };

      onCreated(newSet);
    } catch (e) {
      console.error(e);
      setError('Failed to generate content. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 flex items-center gap-2 text-slate-500 cursor-pointer hover:text-slate-800 transition-colors" onClick={onCancel}>
        <RotateCcw size={16} />
        <span>Back to Dashboard</span>
      </div>

      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
          What do you want to master today?
        </h1>
        <p className="text-lg text-slate-600">Enter a topic, paste text, or upload a document.</p>
      </div>

      <Card className="!p-8 shadow-xl shadow-blue-900/5 border-t-4 border-blue-500">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Topic or Content</label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., The basics of Quantum Physics, or paste your lecture notes here..."
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none h-32"
            />
            
            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Or Upload a Document</label>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    {selectedFile ? (
                      <div className="flex items-center gap-2 text-blue-600">
                        <CheckCircle size={24} />
                        <p className="text-sm font-medium">{selectedFile.name}</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-400 mb-2" />
                        <p className="text-sm text-slate-500">Click to upload PDF or Text</p>
                      </>
                    )}
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept=".pdf,.txt,.doc,.docx"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }} 
                  />
                </label>
              </div>
              {selectedFile && (
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="mt-2 text-xs text-red-500 hover:underline"
                >
                  Remove file
                </button>
              )}
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
               {TOPICS_SUGGESTIONS.map(t => (
                 <button key={t} onClick={() => setTopic(t)} className="whitespace-nowrap px-3 py-1 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                   {t}
                 </button>
               ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { id: ContentType.QUIZ, label: 'Generate Quiz', icon: CheckCircle },
              { id: ContentType.FLASHCARDS, label: 'Flashcards', icon: Zap },
              { id: ContentType.SUMMARY, label: 'Summarize', icon: FileText },
            ].map((option) => (
              <div 
                key={option.id}
                onClick={() => setMode(option.id)}
                className={`cursor-pointer rounded-xl p-4 border-2 flex flex-col items-center justify-center gap-3 transition-all ${
                  mode === option.id 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <option.icon size={24} />
                <span className="font-medium text-sm">{option.label}</span>
              </div>
            ))}
          </div>

          {/* Settings for Quiz */}
          {mode === ContentType.QUIZ && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Difficulty</label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  {['Easy', 'Medium', 'Hard', 'Expert'].map((level) => (
                    <button
                      key={level}
                      onClick={() => setDifficulty(level)}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                        difficulty === level 
                          ? 'bg-white text-blue-600 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-700">Number of Questions</label>
                  <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 rounded">{numQuestions}</span>
                </div>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="1" 
                    max="50" 
                    value={numQuestions} 
                    onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>1</span>
                  <span>50</span>
                </div>
              </div>
            </div>
          )}

          {error && (
             <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm flex items-center">
               <AlertCircle className="w-4 h-4 mr-2" />
               {error}
             </div>
          )}

          <Button 
            onClick={handleGenerate} 
            disabled={(!topic.trim() && !selectedFile)} 
            isLoading={isGenerating} 
            size="lg" 
            className="w-full font-bold text-lg h-14"
          >
            {isGenerating ? 'Gemini is Thinking...' : 'Generate Study Material'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// 7. ANALYZE IMAGE VIEW
function AnalyzeImageView() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedImage) return;
    setLoading(true);
    setResult('');
    try {
      const base64 = await fileToBase64(selectedImage);
      const analysis = await analyzeImage(base64, prompt);
      setResult(analysis);
    } catch (e) {
      console.error(e);
      setResult('Failed to analyze image.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <ImageIcon className="text-blue-600" /> Analyze Image
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors overflow-hidden">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-10 h-10 text-slate-400 mb-3" />
                  <p className="text-sm text-slate-500">Upload an image to analyze</p>
                </div>
              )}
              <input type="file" className="hidden" accept="image/*" onChange={handleImageSelect} />
            </label>
          </Card>
          
          <div>
             <label className="block text-sm font-semibold text-slate-700 mb-2">Prompt (Optional)</label>
             <textarea 
               className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
               placeholder="Describe this image... or ask a question about it"
               value={prompt}
               onChange={(e) => setPrompt(e.target.value)}
             />
          </div>

          <Button onClick={handleAnalyze} disabled={!selectedImage || loading} className="w-full">
            {loading ? <Loader2 className="animate-spin" /> : 'Analyze with Gemini'}
          </Button>
        </div>

        <Card className="h-full min-h-[400px]">
          <h2 className="font-bold mb-4">Analysis Result</h2>
          {result ? (
            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
              {result}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 italic">
              Result will appear here...
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// 8. TEXT TO SPEECH VIEW
function TTSView() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleGenerateSpeech = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const audioBase64 = await generateSpeech(text);
      await playRawAudio(audioBase64);
    } catch (e) {
      console.error(e);
      alert("Failed to generate speech");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <Mic className="text-blue-600" /> Text to Speech
      </h1>

      <Card className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Enter Text</label>
          <textarea
            className="w-full p-4 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-40 resize-none"
            placeholder="Type something for the AI to say..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleGenerateSpeech} disabled={!text.trim() || loading} size="lg">
            {loading ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2 w-4 h-4" />}
            Generate & Play
          </Button>
        </div>
      </Card>
      
      <div className="mt-8 text-center text-slate-500 text-sm">
        Powered by Gemini 2.5 Flash TTS
      </div>
    </div>
  );
}

// 3. QUIZ PLAYER
function QuizPlayer({ set, onComplete, onExit }: { set: StudySet, onComplete: (score: number, mistakes: Mistake[], xpChange: number) => void, onExit: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [sessionMistakes, setSessionMistakes] = useState<Mistake[]>([]);
  const [xpChange, setXpChange] = useState(0);

  const questions = set.content as QuizQuestion[];
  const currentQuestion = questions[currentIndex];

  const handleAnswer = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
    setIsAnswered(true);
    
    if (index === currentQuestion.correctAnswerIndex) {
      setScore(prev => prev + 1);
    } else {
      // Track mistake
      const mistake: Mistake = {
        id: Date.now().toString() + currentIndex,
        question: currentQuestion.question,
        correctAnswer: currentQuestion.options[currentQuestion.correctAnswerIndex],
        userAnswer: currentQuestion.options[index],
        topic: set.title,
        timestamp: Date.now()
      };
      setSessionMistakes(prev => [...prev, mistake]);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      // Calculate XP
      const total = questions.length;
      const percentage = (score / total) * 100;
      let calculatedXp = 0;
      
      if (percentage >= 60) {
        calculatedXp = score * 10;
        if (percentage === 100) calculatedXp += 50; // Perfect score bonus
      } else {
        calculatedXp = -((total - score) * 5); // Loss calculation
      }
      
      setXpChange(calculatedXp);
      setShowResults(true);
      onComplete(score, sessionMistakes, calculatedXp);
    }
  };

  if (showResults) {
    const percentage = Math.round((score / questions.length) * 100);
    const improvement = sessionMistakes.length === 0 ? "Perfect Score!" : `You mastered ${score} concepts.`;

    return (
      <div className="max-w-2xl mx-auto text-center py-12 animate-in zoom-in duration-300">
        <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-6 ${percentage >= 80 ? 'bg-green-100 text-green-600' : percentage >= 60 ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
          <Trophy className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Quiz Completed!</h2>
        <p className="text-slate-600 mb-8">You scored {score} out of {questions.length}</p>
        
        <div className="text-6xl font-black text-slate-800 mb-4 tracking-tighter">
          {percentage}%
        </div>
        
        <div className="flex flex-col items-center gap-2 mb-8">
           <p className="text-slate-500 bg-slate-100 inline-block px-4 py-2 rounded-lg text-sm">{improvement}</p>
           {xpChange !== 0 && (
             <div className={`flex items-center gap-2 font-bold ${xpChange > 0 ? 'text-green-600' : 'text-red-500'}`}>
               {xpChange > 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
               <span>{xpChange > 0 ? '+' : ''}{xpChange} XP</span>
             </div>
           )}
        </div>

        {sessionMistakes.length > 0 && (
           <div className="mb-8 p-4 bg-orange-50 border border-orange-100 rounded-xl text-left">
             <h4 className="font-bold text-orange-800 mb-2 flex items-center gap-2">
               <AlertCircle size={16}/> 
               Identified Weak Areas
             </h4>
             <p className="text-sm text-orange-700">
               We've added {sessionMistakes.length} items to your Smart Revision queue. 
               Check your dashboard to generate a personalized practice set.
             </p>
           </div>
        )}

        <div className="flex justify-center gap-4">
          <Button variant="secondary" onClick={onExit}>Back to Dashboard</Button>
          <Button onClick={() => {
            setCurrentIndex(0);
            setSelectedOption(null);
            setIsAnswered(false);
            setScore(0);
            setSessionMistakes([]);
            setShowResults(false);
            setXpChange(0);
          }}>Retake Quiz</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" size="sm" onClick={onExit}><X size={20} /></Button>
        <div className="text-sm font-medium text-slate-500">
          Question {currentIndex + 1} of {questions.length}
        </div>
        <div className="w-10"></div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2 mb-8">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        ></div>
      </div>

      <Card className="mb-6 min-h-[200px] flex items-center justify-center p-8">
        <h2 className="text-2xl font-semibold text-center text-slate-800 leading-snug">
          {currentQuestion.question}
        </h2>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {currentQuestion.options.map((option, idx) => {
          let stateStyle = "bg-white hover:bg-slate-50 border-slate-200";
          if (isAnswered) {
             if (idx === currentQuestion.correctAnswerIndex) stateStyle = "bg-green-100 border-green-500 text-green-800 ring-1 ring-green-500";
             else if (idx === selectedOption) stateStyle = "bg-red-100 border-red-500 text-red-800 ring-1 ring-red-500";
             else stateStyle = "opacity-50 bg-slate-50 border-slate-200";
          } else if (selectedOption === idx) {
             stateStyle = "bg-blue-50 border-blue-500 text-blue-800";
          }

          return (
            <button
              key={idx}
              onClick={() => handleAnswer(idx)}
              disabled={isAnswered}
              className={`p-4 rounded-xl border-2 text-left font-medium transition-all ${stateStyle}`}
            >
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs flex-shrink-0 opacity-60">
                  {String.fromCharCode(65 + idx)}
                </span>
                <span>{option}</span>
              </div>
            </button>
          );
        })}
      </div>

      {isAnswered && (
        <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-blue-900 text-sm">
            <span className="font-bold block mb-1">Explanation:</span>
            {currentQuestion.explanation}
          </div>
          <div className="flex justify-end">
            <Button size="lg" onClick={handleNext} className="gap-2">
              {currentIndex === questions.length - 1 ? 'Finish' : 'Next Question'} <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// 4. FLASHCARD PLAYER
function FlashcardPlayer({ set, onExit }: { set: StudySet, onExit: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const cards = set.content as Flashcard[];

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev + 1) % cards.length), 200);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length), 200);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 h-full flex flex-col">
       <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" size="sm" onClick={onExit}><X size={20} /></Button>
        <h2 className="font-bold text-slate-700">{set.title}</h2>
        <div className="text-sm font-medium text-slate-500">
          {currentIndex + 1} / {cards.length}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center perspective-1000">
        <div 
          className="relative w-full aspect-[4/3] cursor-pointer group"
          onClick={() => setIsFlipped(!isFlipped)}
          style={{ perspective: '1000px' }}
        >
          <div className={`w-full h-full relative transition-all duration-500 preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`} style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
            
            {/* Front */}
            <div className="absolute inset-0 backface-hidden">
              <Card className="w-full h-full flex flex-col items-center justify-center p-8 border-t-4 border-blue-500 shadow-2xl shadow-blue-900/10">
                <span className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-4">Term</span>
                <p className="text-3xl font-bold text-slate-800 text-center">{cards[currentIndex].front}</p>
                <p className="mt-8 text-sm text-slate-400 font-medium">Click to flip</p>
              </Card>
            </div>

            {/* Back */}
            <div className="absolute inset-0 backface-hidden rotate-y-180" style={{ transform: 'rotateY(180deg)' }}>
              <Card className="w-full h-full flex flex-col items-center justify-center p-8 border-t-4 border-purple-500 shadow-2xl shadow-purple-900/10 bg-slate-50">
                <span className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-4">Definition</span>
                <p className="text-xl text-slate-700 text-center leading-relaxed">{cards[currentIndex].back}</p>
                {cards[currentIndex].hint && (
                  <p className="mt-4 text-sm text-slate-500 italic bg-white px-3 py-1 rounded-full border">Hint: {cards[currentIndex].hint}</p>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center items-center gap-6 mt-8">
        <Button variant="secondary" onClick={handlePrev} className="rounded-full w-12 h-12 p-0 flex items-center justify-center">
          <ArrowRight className="rotate-180" size={20} />
        </Button>
        <Button variant="secondary" onClick={() => setIsFlipped(!isFlipped)} className="px-8">
           Flip Card
        </Button>
        <Button variant="secondary" onClick={handleNext} className="rounded-full w-12 h-12 p-0 flex items-center justify-center">
          <ArrowRight size={20} />
        </Button>
      </div>
    </div>
  );
}

// 5. SUMMARY VIEWER
function SummaryViewer({ set, onExit }: { set: StudySet, onExit: () => void }) {
  const content = set.content as string;
  
  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" size="sm" onClick={onExit}><X size={20} /></Button>
        <h2 className="font-bold text-lg text-slate-800 truncate">{set.title}</h2>
        <div className="w-8"></div>
      </div>
      
      <Card className="prose prose-slate max-w-none p-8 lg:p-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Summary</h1>
        <div className="whitespace-pre-wrap leading-relaxed text-slate-700">
          {content}
        </div>
      </Card>
    </div>
  );
}

// 6. CHAT VIEW
function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'model', text: 'Hello! I am your AI Study Assistant. Ask me anything about your subjects, or ask for a quick quiz on a topic!', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Chat
    try {
      chatSessionRef.current = createChatSession();
    } catch (e) {
      console.error("Failed to init chat", e);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await chatSessionRef.current.sendMessage({ message: userMsg.text });
      const responseText = result.text;
      
      const botMsg: ChatMessage = { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        text: responseText, 
        timestamp: Date.now() 
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
         id: (Date.now() + 1).toString(),
         role: 'model',
         text: "I'm having trouble connecting to my brain right now. Please try again.",
         timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">AI Study Companion</h1>
        <p className="text-slate-500 text-sm">Ask questions, get explanations, or request tips.</p>
      </div>

      <Card className="flex-1 flex flex-col !p-0 overflow-hidden shadow-2xl shadow-blue-900/5">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-none' 
                    : 'bg-white text-slate-800 border border-slate-100 rounded-bl-none'
                }`}
              >
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</div>
              </div>
            </div>
          ))}
          {isLoading && (
             <div className="flex justify-start">
               <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-2">
                 <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                 <span className="text-xs text-slate-500">Thinking...</span>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white border-t border-slate-100 flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask a question about Physics, History, Math..." 
            className="flex-1 bg-slate-100 border-none rounded-xl px-4 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()} className="rounded-xl w-12 h-12 flex items-center justify-center p-0">
            <Send size={20} className={isLoading ? 'opacity-0' : ''} />
          </Button>
        </div>
      </Card>
    </div>
  );
}