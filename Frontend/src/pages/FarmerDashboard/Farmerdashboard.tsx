import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  RiStore3Line, 
  RiLeafFill, 
  RiRobot2Fill, 
  RiMicLine,
  RiSeedlingLine,
} from "react-icons/ri";
import { BsPerson, BsPencilSquare } from "react-icons/bs";
import {
  MdOutlineLogout,
  MdSend,
  MdOutlineMenu,
  MdClose,
  MdDeleteOutline,
  MdPlayCircle,
  MdPauseCircle,
  MdVolumeUp,
} from "react-icons/md";
import { GiWheat, GiWateringCan } from "react-icons/gi";
import { FaSeedling } from "react-icons/fa";
import { BsTruck } from "react-icons/bs";
import { authService } from "../../services/authService";
import { chatService } from "../../services/chatService";
import type { ChatSession as ServiceChatSession } from "../../services/chatService";
import { useToast } from "../../context/ToastContext";
import { ConfirmModal } from "../../components/ConfirmModal/ConfirmModal";
import PageLoader from "../../components/PageLoader/PageLoader";
import { VoiceRecorder } from "../../components/VoiceRecorder/VoiceRecorder";
import type { VoiceRecorderHandle } from "../../components/VoiceRecorder/VoiceRecorder";
import { VoiceWave } from "../../components/VoiceWave/VoiceWave";
import { useTTS } from "../../hooks/useTTS";
import { apiFetch } from "../../services/marketService";
import { BASE_URL } from "../../services/apiConfig";

// ──Onboarding ────────────────────────────────
import {
  FarmerOnboarding,
  shouldShowOnboarding,
  markOnboardingDone,
} from "../../components/FarmerOnboarding/FarmerOnboarding";

import styles from "./Farmerdashboard.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  time: string;
  isVoice?: boolean;
  voiceLanguage?: string;
  voiceText?: string;
}

interface ChatSession {
  id: string;
  title: string;
  preview: string;
  date: string;
  messages: Message[];
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchAIResponse(message: string): Promise<string> {
  const token = authService.getToken();
  if (!token) throw new Error("Not authenticated");

  try {
    const res = await apiFetch(`${BASE_URL}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? data.message ?? "Something went wrong");
    }
    return data.aiText as string;
  } catch (error: any) {
    // Handle authentication errors
    if (error.message === "Not authenticated") {
      throw new Error("Your session has expired. Please log in again.");
    }
    // Re-throw apiFetch errors (they're already user-friendly)
    throw error;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const user = authService.getUser() ?? { name: "Farmer", email: "" };
const initials =
  user.name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase() ?? "F";
const firstName = user.name?.split(" ")[0] ?? "Farmer";

function newId() {
  return Math.random().toString(36).slice(2);
}

function nowTime() {
  return new Date().toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FarmerChat() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { speak, stop } = useTTS();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setSection] = useState<"chat" | "profile">("chat");
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    sessionId: string | null;
  }>({ show: false, sessionId: null });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // ── Onboarding + choice modal — computed at mount time ────────────────────
  const [showOnboarding, setShowOnboarding] = useState(() => shouldShowOnboarding());
  const [showChoiceModal, setShowChoiceModal] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voiceRecorderRef = useRef<VoiceRecorderHandle>(null);

  const SUGGESTIONS = [
    { icon: <GiWheat size={14} />, text: "Check my Maize crop" },
    { icon: <FaSeedling size={13} />, text: "Tomato harvest advice" },
    { icon: <GiWateringCan size={14} />, text: "When to water Cassava" },
    { icon: <BsTruck size={13} />, text: "Upcoming deliveries" },
  ];

  // ── Prevent back button from closing the app ──────────────────────────
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    loadSessions();
  }, []);

  // ── Onboarding useEffect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!showOnboarding) {
      const justLoggedIn = authService.consumeJustLoggedIn();
      if (justLoggedIn) setShowChoiceModal(true);
    }
  }, []);

  // ── Onboarding complete handler ────────────────────────────────────────────
  const handleOnboardingComplete = () => {
    markOnboardingDone();
    setShowOnboarding(false);
    setShowChoiceModal(true);
  };

  // ── Choice modal handler ──────────────────────────────────────────────────
  const handleFarmerChoice = (choice: "sell" | "ai") => {
    setShowChoiceModal(false);
    if (choice === "sell") {
      navigate("/seller");
      addToast("Welcome to Seller Mode! List your produce here.", "success");
    } else {
      addToast("Ask me anything about your crops!", "success");
    }
  };

  // ── loadSessions ──────────────────────────────────────────────────────────
  const loadSessions = async () => {
    try {
      setLoading(true);
      const { sessions: dbSessions } = await chatService.getSessions();
      const loadedSessions: ChatSession[] = dbSessions.map(
        (s: ServiceChatSession) => ({
          id: s.id,
          title: s.title,
          preview: s.messages[0]?.content?.substring(0, 50) || "New Chat",
          date: new Date(s.updatedAt).toLocaleDateString(),
          messages: s.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            text: m.content,
            time: new Date(m.createdAt).toLocaleTimeString(),
            isVoice: m.isVoice ?? false,
            voiceText: m.voiceText ?? undefined,
            voiceLanguage: m.language ?? undefined,
          })),
        }),
      );
      setSessions(loadedSessions);
      if (loadedSessions.length > 0) {
        const mostRecent = loadedSessions[0];
        setActiveId(mostRecent.id);
        setCurrentSessionId(mostRecent.id);
        setMessages(mostRecent.messages);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
      addToast("Failed to load chat history", "error");
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = async () => {
    setActiveId(null);
    setCurrentSessionId(null);
    setMessages([]);
    setInput("");
    setSidebarOpen(false);
    setSection("chat");
  };

  const loadSession = (s: ChatSession) => {
    setActiveId(s.id);
    setCurrentSessionId(s.id);
    setMessages(s.messages);
    setSidebarOpen(false);
    setSection("chat");
  };

  const handleDeleteClick = (sessionId: string) => {
    setDeleteConfirm({ show: true, sessionId });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.sessionId) return;
    try {
      await chatService.deleteSession(deleteConfirm.sessionId);
      await loadSessions();
      if (activeId === deleteConfirm.sessionId) startNewChat();
      addToast("Chat deleted successfully", "success");
    } catch (error) {
      console.error("Failed to delete session:", error);
      addToast("Failed to delete chat", "error");
    } finally {
      setDeleteConfirm({ show: false, sessionId: null });
    }
  };

  const handlePlayPause = (msgId: string, voiceText: string, language: string) => {
    if (playingMsgId === msgId) {
      stop();
      setPlayingMsgId(null);
    } else {
      stop();
      setPlayingMsgId(msgId);
      speak(voiceText, language, () => setPlayingMsgId(null));
    }
  };

  // ── handleVoiceTranscript ──────────────────────────────────────────────────
  const handleVoiceTranscript = async (aiResponse: string, language?: string, originalText?: string) => {
    setIsRecording(false);
    if (!aiResponse?.trim()) return;

    const lang = language ?? "english";
    const userMsgId = newId();
    const aiMsgId = newId();

    const userVoiceMsg: Message = {
      id: userMsgId,
      role: "user",
      text: "Voice message",
      time: nowTime(),
      isVoice: true,
      voiceLanguage: lang,
      voiceText: originalText ?? "",
    };

    const aiMsg: Message = {
      id: aiMsgId,
      role: "ai",
      text: aiResponse.trim(),
      time: nowTime(),
      isVoice: false,
      voiceLanguage: lang,
      voiceText: aiResponse.trim(),
    };

    setMessages((prev) => [...prev, userVoiceMsg, aiMsg]);

    setPlayingMsgId(aiMsgId);
    speak(aiResponse.trim(), lang, () => setPlayingMsgId(null));

    try {
      let sessionId = currentSessionId;
      if (!sessionId) {
        const { session } = await chatService.createSession("Voice message");
        sessionId = session.id;
        setCurrentSessionId(sessionId);
        setActiveId(sessionId);
      }

      await chatService.saveMessage(
        sessionId,
        "user",
        originalText ?? "Voice message",
        { isVoice: true, voiceText: originalText ?? "", language: lang }
      );

      await chatService.saveMessage(
        sessionId,
        "ai",
        aiResponse.trim(),
        { isVoice: false, voiceText: aiResponse.trim(), language: lang }
      );

      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === sessionId);
        const updated = [...messages, userVoiceMsg, aiMsg];
        if (idx !== -1) {
          const arr = [...prev];
          arr[idx] = { ...arr[idx], messages: updated, preview: "Voice message", date: "Today" };
          const [moved] = arr.splice(idx, 1);
          return [moved, ...arr];
        }
        return [
          {
            id: sessionId!,
            title: "Voice message",
            preview: "Voice message",
            date: "Today",
            messages: updated,
          },
          ...prev,
        ];
      });
    } catch (err) {
      console.error("Failed to save voice session:", err);
    }
  };

  // ── TEXT SEND ──────────────────────────────────────────────────────────────
  const send = async (text: string) => {
    if (!text.trim() || typing) return;

    const userMsg: Message = {
      id: newId(),
      role: "user",
      text: text.trim(),
      time: nowTime(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    try {
      let sessionId = currentSessionId;
      if (!sessionId) {
        const { session } = await chatService.createSession(text.slice(0, 40));
        sessionId = session.id;
        setCurrentSessionId(sessionId);
        setActiveId(sessionId);
      }

      await chatService.saveMessage(sessionId, "user", userMsg.text);
      const aiText = await fetchAIResponse(text.trim());

      const aiMsg: Message = {
        id: newId(),
        role: "ai",
        text: aiText,
        time: nowTime(),
      };

      await chatService.saveMessage(sessionId, "ai", aiMsg.text);

      setMessages((prev) => {
        const updated = [...prev, aiMsg];
        setSessions((prevSessions) => {
          const existingIndex = prevSessions.findIndex((s) => s.id === sessionId);
          if (existingIndex !== -1) {
            const updatedSessions = [...prevSessions];
            updatedSessions[existingIndex] = {
              ...updatedSessions[existingIndex],
              messages: updated,
              preview: text,
              date: "Today",
            };
            const [moved] = updatedSessions.splice(existingIndex, 1);
            return [moved, ...updatedSessions];
          }
          return [
            {
              id: sessionId!,
              title: text.length > 40 ? text.slice(0, 40) + "…" : text,
              preview: text,
              date: "Today",
              messages: updated,
            },
            ...prevSessions,
          ];
        });
        return updated;
      });
    } catch (err: any) {
      const errMsg: Message = {
        id: newId(),
        role: "ai",
        text:
          err.message === "Not authenticated"
            ? "Your session has expired. Please log in again."
            : "Something went wrong. Please try again.",
        time: nowTime(),
      };
      setMessages((prev) => [...prev, errMsg]);
      
      // Use the error message from apiFetch (already user-friendly)
      const errorMessage = err.message || "Something went wrong. Please try again.";
      addToast(errorMessage, "error");
    } finally {
      setTyping(false);
      inputRef.current?.focus();
    }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    setInput(textarea.value);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = () => {
    authService.clearSession();
    navigate("/login");
    addToast("Logged out successfully", "success");
  };

  const isEmpty = messages.length === 0;

  const switchToSeller = () => {
    navigate("/seller");
    addToast("Switched to Seller Mode", "success");
  };

  // ── RENDER: Onboarding takes priority ──────────────────────────────────────
  if (showOnboarding) {
    return <FarmerOnboarding onComplete={handleOnboardingComplete} />;
  }

  if (loading) return <PageLoader />;

  return (
    <>
      <div className={styles.shell}>
        {/* ── Choice modal ──────────────────────────────────────────────────── */}
        {showChoiceModal && (
          <div className={styles.choiceModalOverlay}>
            <div className={styles.choiceModal}>
              <div className={styles.choiceModalHeader}>
                <div className={styles.choiceModalIcon}>
                  <RiLeafFill size={36} color="#2d6a35" />
                </div>
                <h2 className={styles.choiceModalTitle}>Welcome back, {firstName}</h2>
                <p className={styles.choiceModalSubtitle}>What would you like to do today?</p>
              </div>
              <div className={styles.choiceModalOptions}>
                <button className={styles.choiceOption} onClick={() => handleFarmerChoice("sell")}>
                  <div className={styles.choiceOptionIcon}>
                    <RiStore3Line size={32} color="#2d6a35" />
                  </div>
                  <div className={styles.choiceOptionContent}>
                    <h3>Sell Produce</h3>
                    <p>List your harvest for buyers to find and purchase</p>
                  </div>
                  <div className={styles.choiceOptionArrow}>→</div>
                </button>
                <button className={styles.choiceOption} onClick={() => handleFarmerChoice("ai")}>
                  <div className={styles.choiceOptionIcon}>
                    <RiRobot2Fill size={32} color="#a8d832" />
                  </div>
                  <div className={styles.choiceOptionContent}>
                    <h3>AI Assistant</h3>
                    <p>Get crop advice, harvest timing, and pest control</p>
                  </div>
                  <div className={styles.choiceOptionArrow}>→</div>
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={deleteConfirm.show}
          title="Delete Chat"
          message="Are you sure you want to delete this chat? This action cannot be undone."
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm({ show: false, sessionId: null })}
        />
        <ConfirmModal
          isOpen={showLogoutConfirm}
          title="Logout"
          message="Are you sure you want to log out? You will need to login again to access your account."
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />

        {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}

        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
          <div className={styles.sidebarLogo}>
            <div className={styles.logoMark}>
              <RiLeafFill size={16} />
            </div>
            <span className={styles.logoText}>
              AgroFlow<span>+</span>
            </span>
            <button className={styles.sidebarCloseBtn} onClick={() => setSidebarOpen(false)}>
              <MdClose size={18} />
            </button>
          </div>

          <button className={styles.newChatBtn} onClick={startNewChat}>
            <BsPencilSquare size={15} />
            <span>New Chat</span>
          </button>

          <div className={styles.historySection}>
            <div className={styles.historyLabel}>Recent Chats</div>
            <div className={styles.historyList}>
              {sessions.map((s) => (
                <div key={s.id} className={styles.historyItemWrapper}>
                  <button
                    className={`${styles.historyItem} ${activeId === s.id ? styles.historyItemActive : ""}`}
                    onClick={() => loadSession(s)}
                  >
                    <div className={styles.historyItemTitle}>{s.title}</div>
                    <div className={styles.historyItemMeta}>
                      <span className={styles.historyItemPreview}>{s.preview}</span>
                      <span className={styles.historyItemDate}>{s.date}</span>
                    </div>
                  </button>
                  <button
                    className={styles.deleteSessionBtn}
                    onClick={() => handleDeleteClick(s.id)}
                    title="Delete chat"
                  >
                    <MdDeleteOutline size={15} />
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className={styles.noHistory}>
                  <p>No chats yet</p>
                  <p className={styles.noHistoryHint}>Start a new conversation above</p>
                </div>
              )}
            </div>
          </div>

          <div className={styles.switchBox}>
            <div className={styles.switchLbl}>Switch Mode</div>
            <button className={styles.switchBtn} onClick={switchToSeller}>
              <RiStore3Line size={14} /> Go to Seller Mode
            </button>
          </div>
          <div className={styles.sidebarDivider} />
          <div className={styles.sidebarBottom}>
            <button
              className={`${styles.sidebarBottomBtn} ${activeSection === "profile" ? styles.sidebarBottomBtnActive : ""}`}
              onClick={() => {
                setSection("profile");
                setSidebarOpen(false);
              }}
            >
              <div className={styles.sidebarBottomIcon}>
                <BsPerson size={16} />
              </div>
              <span className={styles.sidebarBottomText}>Profile</span>
            </button>
            <button className={styles.sidebarBottomBtn} onClick={handleLogout}>
              <div className={`${styles.sidebarBottomIcon} ${styles.logoutIcon}`}>
                <MdOutlineLogout size={16} />
              </div>
              <span className={`${styles.sidebarBottomText} ${styles.logoutText}`}>Log Out</span>
            </button>
          </div>
        </aside>

        <div className={styles.main}>
          <header className={styles.topbar}>
            <button className={styles.menuBtn} onClick={() => setSidebarOpen((p) => !p)}>
              <MdOutlineMenu size={20} />
            </button>
            <div className={styles.topbarCenter}>
              <span className={styles.topbarTitle}>AgroFlow AI</span>
            </div>
            <div className={styles.topbarAvatar}>{initials}</div>
          </header>

          {activeSection === "profile" && (
            <div className={styles.profileWrap}>
              <div className={styles.profileCard}>
                <div className={styles.profileAvatar}>{initials}</div>
                <div className={styles.profileName}>{user.name}</div>
                <div className={styles.profileBadge}>
                  <RiSeedlingLine size={12} /> Farmer
                </div>
              </div>
              <div className={styles.profileForm}>
                <div className={styles.profileFormTitle}>Edit Profile</div>
                <div className={styles.profileFields}>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Full Name</label>
                      <input className={styles.fieldInput} defaultValue={user.name} />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Email</label>
                      <input className={styles.fieldInput} defaultValue={user.email} type="email" />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Phone</label>
                      <input className={styles.fieldInput} placeholder="+234 800 000 0000" />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Location</label>
                      <input className={styles.fieldInput} placeholder="e.g. Ibadan, Oyo" />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Farm Size</label>
                      <input className={styles.fieldInput} placeholder="e.g. 5 hectares" />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Soil Type</label>
                      <input className={styles.fieldInput} placeholder="e.g. Loamy" />
                    </div>
                  </div>
                  <button className={styles.saveBtn}>Save Changes</button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "chat" && (
            <>
              <div className={styles.chatArea}>
                {isEmpty && (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyOrb}>
                      <RiRobot2Fill size={36} style={{ color: "#2d6a35" }} />
                    </div>
                    <h2 className={styles.emptyTitle}>{getGreeting()}, {firstName}</h2>
                    <p className={styles.emptySubtitle}>
                      I'm your AgroFlow AI assistant. Ask me anything about your
                      crops, harvest timing, soil health, weather, or deliveries.
                    </p>
                    <div className={styles.suggestions}>
                      {SUGGESTIONS.map(({ icon, text }) => (
                        <button key={text} className={styles.suggestionChip} onClick={() => send(text)}>
                          {icon}
                          <span>{text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!isEmpty && (
                  <div className={styles.messages}>
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`${styles.msgRow} ${msg.role === "user" ? styles.msgRowUser : styles.msgRowAI}`}
                      >
                        {msg.role === "ai" && (
                          <div className={styles.msgAvatar}>
                            <RiRobot2Fill size={16} style={{ color: "#2d6a35" }} />
                          </div>
                        )}

                        <div
                          className={`${styles.msgBubble} ${
                            msg.role === "user" ? styles.msgBubbleUser : styles.msgBubbleAI
                          } ${msg.isVoice && msg.role === "user" ? styles.msgBubbleVoice : ""}`}
                        >
                          {msg.isVoice && msg.role === "user" ? (
                            <div className={styles.voiceMsgContent}>
                              <button
                                className={styles.playPauseBtn}
                                onClick={() =>
                                  handlePlayPause(
                                    msg.id,
                                    msg.voiceText ?? msg.text,
                                    msg.voiceLanguage ?? "english"
                                  )
                                }
                                aria-label={playingMsgId === msg.id ? "Pause" : "Play"}
                              >
                                {playingMsgId === msg.id ? (
                                  <MdPauseCircle size={26} />
                                ) : (
                                  <MdPlayCircle size={26} />
                                )}
                              </button>
                              <div
                                className={`${styles.voiceBarWrap} ${
                                  playingMsgId === msg.id ? styles.voiceBarActive : ""
                                }`}
                              >
                                {Array.from({ length: 18 }).map((_, i) => (
                                  <div
                                    key={i}
                                    className={styles.voiceBar}
                                    style={{ animationDelay: `${i * 0.06}s` }}
                                  />
                                ))}
                              </div>
                              <span className={styles.msgTime} style={{ marginTop: 0, marginLeft: 4 }}>
                                {msg.time}
                              </span>
                            </div>
                          ) : (
                            <>
                              <div className={styles.msgText}>
                                {msg.text.split("\n").map((line, i, arr) => (
                                  <span key={i}>
                                    {line}
                                    {i < arr.length - 1 && <br />}
                                  </span>
                                ))}
                              </div>

                              {msg.role === "ai" && msg.voiceLanguage && msg.voiceText && (
                                <button
                                  className={`${styles.listenBtn} ${
                                    playingMsgId === msg.id ? styles.listenBtnPlaying : ""
                                  }`}
                                  onClick={() =>
                                    handlePlayPause(msg.id, msg.voiceText!, msg.voiceLanguage!)
                                  }
                                  aria-label={playingMsgId === msg.id ? "Pause" : "Listen"}
                                >
                                  {playingMsgId === msg.id ? (
                                    <>
                                      <MdPauseCircle size={13} />
                                      <span>Pause</span>
                                    </>
                                  ) : (
                                    <>
                                      <MdVolumeUp size={13} />
                                      <span>Listen</span>
                                    </>
                                  )}
                                </button>
                              )}

                              <div className={styles.msgTime}>{msg.time}</div>
                            </>
                          )}
                        </div>

                        {msg.role === "user" && (
                          <div className={`${styles.msgAvatar} ${styles.msgAvatarUser}`}>
                            {msg.isVoice ? <RiMicLine size={14} /> : initials}
                          </div>
                        )}
                      </div>
                    ))}

                    {typing && (
                      <div className={`${styles.msgRow} ${styles.msgRowAI}`}>
                        <div className={styles.msgAvatar}>
                          <RiRobot2Fill size={16} style={{ color: "#2d6a35" }} />
                        </div>
                        <div className={`${styles.msgBubble} ${styles.msgBubbleAI} ${styles.typingBubble}`}>
                          <div className={styles.typingDots}>
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>

              <div className={styles.inputWrap}>
                {!isEmpty && (
                  <div className={styles.suggestionsRow}>
                    {SUGGESTIONS.map(({ icon, text }) => (
                      <button key={text} className={styles.suggestionChipSm} onClick={() => send(text)}>
                        {icon}
                        <span>{text}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className={styles.inputBox}>
                  <div
                    className={`${styles.voiceWaveWrapper} ${
                      isRecording ? styles.voiceWaveWrapperVisible : ""
                    }`}
                  >
                    <VoiceWave isRecording={isRecording} audioLevel={audioLevel} />
                  </div>

                  <VoiceRecorder
                    ref={voiceRecorderRef}
                    onTranscript={handleVoiceTranscript}
                    disabled={typing}
                    onRecordingStateChange={setIsRecording}
                    onProcessingStateChange={setIsProcessing}
                    onAudioLevel={setAudioLevel}
                  />

                  <textarea
                    ref={inputRef}
                    className={`${styles.inputField} ${isRecording ? styles.inputFieldHidden : ""}`}
                    placeholder="Ask about your crops, harvest, soil, weather…"
                    value={input}
                    onChange={autoResize}
                    onKeyDown={handleKey}
                    rows={1}
                    wrap="soft"
                  />

                  {isRecording && (
                    <button
                      className={styles.cancelBtn}
                      onClick={() => voiceRecorderRef.current?.cancelRecording()}
                      aria-label="Cancel recording"
                    >
                      <MdClose size={20} />
                    </button>
                  )}

                  {isProcessing ? (
                    <div className={styles.spinnerBtn}>
                      <div className={styles.spinner} />
                    </div>
                  ) : input.trim() || isRecording ? (
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnActive}`}
                      onClick={() => {
                        if (isRecording) {
                          voiceRecorderRef.current?.stopAndSend();
                        } else {
                          send(input);
                        }
                      }}
                      disabled={typing}
                      aria-label="Send"
                    >
                      <MdSend size={18} />
                    </button>
                  ) : (
                    <button
                      className={styles.actionBtn}
                      onClick={() => voiceRecorderRef.current?.startRecording()}
                      disabled={typing}
                      aria-label="Record voice"
                    >
                      <RiMicLine size={20} />
                    </button>
                  )}
                </div>
                <div className={styles.inputHint}>Press Enter to send · Shift+Enter for new line</div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}