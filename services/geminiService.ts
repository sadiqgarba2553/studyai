import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ContentType, QuizQuestion, Flashcard, Mistake } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface FileInput {
  mimeType: string;
  data: string; // Base64 encoded string
}

/**
 * Generate a Quiz based on a topic, text content, or file
 */
export const generateQuiz = async (
  topic: string, 
  difficulty: string = 'Medium', 
  numQuestions: number = 5,
  file?: FileInput
): Promise<QuizQuestion[]> => {
  // Use gemini-2.5-flash for fast processing, or upgrade to pro if needed for complex docs
  const modelId = "gemini-2.5-flash"; 
  
  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING, description: "The quiz question text" },
        options: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "An array of 4 possible answers"
        },
        correctAnswerIndex: { type: Type.INTEGER, description: "The index (0-3) of the correct answer" },
        explanation: { type: Type.STRING, description: "A brief explanation of why the answer is correct" }
      },
      required: ["question", "options", "correctAnswerIndex", "explanation"]
    }
  };

  const parts: any[] = [];
  
  if (file) {
    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: file.data
      }
    });
    parts.push({ text: `Analyze this document and create a strict ${numQuestions}-question multiple choice quiz about the content. Difficulty: ${difficulty}. Ensure options are plausible. Output JSON.` });
  } else {
    parts.push({ text: `Create a strict ${numQuestions}-question multiple choice quiz about: "${topic}". Difficulty: ${difficulty}. Ensure the options are plausible. The output must be a valid JSON array matching the schema.` });
  }

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: parts.length > 1 ? { parts } : parts[0].text,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.7,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as QuizQuestion[];
  } catch (error) {
    console.error("Gemini Quiz Error:", error);
    throw error;
  }
};

/**
 * Generate Flashcards based on a topic or text content
 */
export const generateFlashcards = async (topic: string): Promise<Flashcard[]> => {
  const modelId = "gemini-2.5-flash";

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        front: { type: Type.STRING, description: "The term, concept, or question on the front of the card" },
        back: { type: Type.STRING, description: "The definition, answer, or detail on the back" },
        hint: { type: Type.STRING, description: "A subtle hint to help recall the answer" }
      },
      required: ["front", "back"]
    }
  };

  const prompt = `Create a set of 8 educational flashcards about: "${topic}".
  Keep the front concise and the back informative.
  The output must be a valid JSON array matching the schema.`;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text) as Flashcard[];
  } catch (error) {
    console.error("Gemini Flashcard Error:", error);
    throw error;
  }
};

/**
 * Generate a Smart Revision Quiz based on previous mistakes
 */
export const generateRevisionQuiz = async (mistakes: Mistake[]): Promise<QuizQuestion[]> => {
  const modelId = "gemini-2.5-flash";

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING, description: "The quiz question text" },
        options: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "An array of 4 possible answers"
        },
        correctAnswerIndex: { type: Type.INTEGER, description: "The index (0-3) of the correct answer" },
        explanation: { type: Type.STRING, description: "A brief explanation of why the answer is correct" }
      },
      required: ["question", "options", "correctAnswerIndex", "explanation"]
    }
  };

  // Construct context from mistakes
  const errorContext = mistakes.map(m => 
    `- Topic: ${m.topic}\n  Question: ${m.question}\n  Correct Answer: ${m.correctAnswer}`
  ).join('\n\n');

  const prompt = `The user answered the following questions incorrectly in previous sessions:
  
  ${errorContext}
  
  Please create a remedial revision quiz (5 questions) that targets the underlying concepts of these mistakes. 
  Do not simply repeat the questions. Create NEW questions that test the same knowledge or logic to ensure the user has mastered the concept.
  The output must be a valid JSON array matching the schema.`;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.7,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as QuizQuestion[];
  } catch (error) {
    console.error("Gemini Revision Quiz Error:", error);
    throw error;
  }
};

/**
 * Generate a Summary
 */
export const generateSummary = async (textToSummarize: string): Promise<string> => {
  const modelId = "gemini-2.5-flash";
  
  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `Provide a structured summary of the following content. Use bullet points for key takeaways. Content: ${textToSummarize.substring(0, 8000)}`, // Truncate for safety
    });
    
    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("Gemini Summary Error:", error);
    return "Error generating summary. Please try again.";
  }
};

/**
 * Analyze an Image
 */
export const analyzeImage = async (base64Image: string, promptText: string): Promise<string> => {
  // Using gemini-3-pro-preview as requested for image understanding
  const modelId = "gemini-3-pro-preview";
  
  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg', // Assuming jpeg/png for simplicity, or could pass mimeType
              data: base64Image
            }
          },
          { text: promptText || "Analyze this image in detail." }
        ]
      }
    });

    return response.text || "Could not analyze image.";
  } catch (error) {
    console.error("Gemini Image Analysis Error:", error);
    throw error;
  }
};

/**
 * Generate Speech (TTS)
 */
export const generateSpeech = async (text: string): Promise<string> => {
  // Using gemini-2.5-flash-preview-tts as requested
  const modelId = "gemini-2.5-flash-preview-tts";

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    // Extract audio data
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new Error("No audio generated");
    
    return audioData;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
};

/**
 * Chat Stream
 */
export const createChatSession = () => {
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: "You are StudyAI, a helpful, encouraging, and knowledgeable study assistant. Help the user learn concepts, answer questions about their study materials, and provide tips. Keep answers concise.",
    }
  });
};