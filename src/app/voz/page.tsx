"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Logan Voz — Voice Assistant (Fase 0, browser-based).
 *
 * Uses the browser's Web Speech API:
 *   - SpeechRecognition: voice → text (free, built into Chrome/Safari)
 *   - SpeechSynthesis: text → voice (free, built in)
 *
 * Flow: tap mic (or say "Logan" in wake mode) → speak → transcribed →
 *       sent to /api/voz → Logan responds → spoken back.
 *
 * 100% free. Works on desktop Chrome and mobile.
 */

type Turn = { role: "user" | "assistant"; content: string };
type Status = "idle" | "listening" | "thinking" | "speaking";

export default function VozPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");

  const recognitionRef = useRef<any>(null);
  const historyRef = useRef<Turn[]>([]);

  // Check browser support
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || !window.speechSynthesis) {
      setSupported(false);
    }
  }, []);

  const speak = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "es-MX";
      utter.rate = 1.05;
      utter.pitch = 1;
      // Prefer a Spanish voice
      const voices = synth.getVoices();
      const esVoice = voices.find((v) => v.lang.startsWith("es"));
      if (esVoice) utter.voice = esVoice;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      setStatus("speaking");
      synth.speak(utter);
    });
  }, []);

  const askLogan = useCallback(async (userText: string) => {
    setStatus("thinking");
    const newUserTurn: Turn = { role: "user", content: userText };
    setTurns((t) => [...t, newUserTurn]);

    try {
      const res = await fetch("/api/voz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history: historyRef.current }),
      });
      const data = await res.json();
      const reply = data.response || "No pude procesar eso.";

      const assistantTurn: Turn = { role: "assistant", content: reply };
      setTurns((t) => [...t, assistantTurn]);
      historyRef.current = [...historyRef.current, newUserTurn, assistantTurn].slice(-8);

      await speak(reply);
    } catch {
      const errMsg = "Disculpa, tuve un problema. Intenta de nuevo.";
      setTurns((t) => [...t, { role: "assistant", content: errMsg }]);
      await speak(errMsg);
    } finally {
      setStatus("idle");
      setTranscript("");
    }
  }, [speak]);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    const recognition = new SR();
    recognition.lang = "es-MX";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    setError("");
    setTranscript("");
    setStatus("listening");

    let finalText = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setTranscript(finalText || interim);
    };

    recognition.onerror = (e: any) => {
      if (e.error === "no-speech") {
        setError("No te escuché. Intenta de nuevo.");
      } else if (e.error === "not-allowed") {
        setError("Necesito permiso para usar el micrófono.");
      } else {
        setError("Error de reconocimiento. Intenta de nuevo.");
      }
      setStatus("idle");
    };

    recognition.onend = () => {
      if (finalText.trim()) {
        askLogan(finalText.trim());
      } else if (status === "listening") {
        setStatus("idle");
      }
    };

    recognition.start();
  }, [askLogan, status]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const handleMicClick = () => {
    if (status === "listening") {
      stopListening();
    } else if (status === "idle") {
      startListening();
    } else if (status === "speaking") {
      window.speechSynthesis.cancel();
      setStatus("idle");
    }
  };

  const statusText: Record<Status, string> = {
    idle: "Toca para hablar",
    listening: "Escuchando...",
    thinking: "Pensando...",
    speaking: "Hablando...",
  };

  const orbClass: Record<Status, string> = {
    idle: "bg-gradient-to-br from-sky-500 to-blue-600",
    listening: "bg-gradient-to-br from-red-500 to-pink-600 animate-pulse scale-110",
    thinking: "bg-gradient-to-br from-purple-500 to-indigo-600 animate-pulse",
    speaking: "bg-gradient-to-br from-green-500 to-emerald-600",
  };

  if (!supported) {
    return (
      <div className="min-h-screen bg-[#060918] flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <div className="text-5xl mb-4">🎙️</div>
          <h1 className="text-xl font-bold text-white mb-2">Navegador no compatible</h1>
          <p className="text-gray-400 text-sm">Logan Voz funciona en Chrome (PC/Android) o Safari (iPhone). Abre esta página en uno de esos navegadores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-6 text-white relative overflow-hidden"
         style={{ background: "radial-gradient(at 50% 20%, rgba(56,189,248,0.1) 0%, transparent 55%), radial-gradient(at 50% 90%, rgba(168,85,247,0.08) 0%, transparent 55%), #060918" }}>

      {/* Header */}
      <div className="text-center pt-8">
        <div className="inline-flex items-center gap-2 mb-1">
          <div className="w-7 h-7 bg-gradient-to-br from-sky-500 to-blue-600 rounded-lg flex items-center justify-center text-xs font-black">L</div>
          <span className="font-bold tracking-tight">Logan Voz</span>
        </div>
        <p className="text-xs text-gray-500">Tu asistente personal por voz</p>
      </div>

      {/* Conversation */}
      <div className="flex-1 w-full max-w-md overflow-y-auto py-6 space-y-3 my-4">
        {turns.length === 0 && (
          <div className="text-center text-gray-500 text-sm mt-10 space-y-4">
            <p>Prueba diciendo:</p>
            <div className="space-y-2 text-gray-400">
              <p>"¿Qué hora es aproximadamente?"</p>
              <p>"Guárdame una nota: comprar camarón"</p>
              <p>"Cuéntame un dato curioso"</p>
              <p>"¿Cuánto es 15% de 4200?"</p>
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              t.role === "user"
                ? "bg-sky-600/80 rounded-br-md"
                : "bg-white/5 border border-white/10 rounded-bl-md text-gray-200"
            }`}>
              {t.content}
            </div>
          </div>
        ))}
        {status === "listening" && transcript && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm bg-sky-600/40 text-gray-300 italic">
              {transcript}
            </div>
          </div>
        )}
      </div>

      {/* Mic Orb + Status */}
      <div className="flex flex-col items-center gap-4 pb-10">
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          onClick={handleMicClick}
          disabled={status === "thinking"}
          className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl transition-all duration-300 shadow-2xl ${orbClass[status]} ${status === "thinking" ? "opacity-70 cursor-wait" : "hover:scale-105 cursor-pointer"}`}
          style={{ boxShadow: "0 0 60px rgba(56,189,248,0.3)" }}
        >
          {status === "listening" ? "🔴" : status === "thinking" ? "🧠" : status === "speaking" ? "🔊" : "🎙️"}
        </button>
        <p className="text-sm text-gray-400 font-medium">{statusText[status]}</p>
      </div>
    </div>
  );
}
