import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { LISTINGS as FALLBACK_LISTINGS } from "../constants";
import { motion, AnimatePresence } from "motion/react";
import { resolveImageUrl } from "../lib/imageUtils";
import { Save, LogOut, RefreshCw, Upload, X as CloseIcon, Loader2, Check, Calendar as CalendarIcon, Search, Plus, Trash2, TrendingUp, BookOpen, Lock, Unlock, Edit3, Sparkles, LayoutDashboard, ChevronDown } from "lucide-react";
import { GoogleGenAI } from "@google/genai";
import ExecutiveView from "./ExecutiveView";

interface AdminDashboardProps {
  onClose: () => void;
}

export default function AdminDashboard({ onClose }: AdminDashboardProps) {
  const [apartments, setApartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string, index: number } | null>(null);
  const [saveAllStatus, setSaveAllStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [activeTab, setActiveTab] = useState<"listings" | "pricing" | "reservations" | "knowledge">("listings");
  const [knowledgeBase, setKnowledgeBase] = useState<any[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [knowledgeForm, setKnowledgeForm] = useState({ category: "", content: "", is_private: false });
  const [aiEvents, setAiEvents] = useState<any[]>([]);
  const [searchingEvents, setSearchingEvents] = useState(false);
  const [specialPrices, setSpecialPrices] = useState<any[]>([]);
  const [allSpecialPrices, setAllSpecialPrices] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [selectedApartmentId, setSelectedApartmentId] = useState<string | null>(null);
  const [tempPrices, setTempPrices] = useState<{ [key: string]: number }>({});
  const [eventPrices, setEventPrices] = useState<{ [key: string]: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState({
    high: { start: "", end: "", weekday: "", weekend: "" },
    shoulder: { start: "", end: "", weekday: "", weekend: "" },
    low: { start: "", end: "",
