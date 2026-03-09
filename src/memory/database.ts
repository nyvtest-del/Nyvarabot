import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { config } from "../config.js";

export class MemoryDB {
  private db: Firestore;

  private constructor() {
    // Inicializar Firebase Admin si no está inicializado
    if (getApps().length === 0) {
      let serviceAccount;

      if (config.FIREBASE_SERVICE_ACCOUNT) {
        console.log("🛠️ Inicializando Firebase usando FIREBASE_SERVICE_ACCOUNT (string)");
        serviceAccount = JSON.parse(config.FIREBASE_SERVICE_ACCOUNT);
      } else if (config.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log(`🛠️ Inicializando Firebase usando archivo: ${config.GOOGLE_APPLICATION_CREDENTIALS}`);
        serviceAccount = JSON.parse(
          readFileSync(config.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
        );
      } else {
        throw new Error(
          "Debe configurar FIREBASE_SERVICE_ACCOUNT (JSON string) o GOOGLE_APPLICATION_CREDENTIALS (ruta de archivo) en su entorno."
        );
      }

      initializeApp({
        credential: cert(serviceAccount),
      });
    }

    this.db = getFirestore();
  }

  /**
   * Factory asíncrono para mantener consistencia con la interfaz original
   */
  static async create(): Promise<MemoryDB> {
    const instance = new MemoryDB();
    console.log("🔥 Conectado a Firebase Firestore");
    return instance;
  }

  // ─── Memoria persistente ──────────────────────────────

  async saveMemory(key: string, content: string): Promise<void> {
    const docRef = this.db.collection("memories").doc(key);
    await docRef.set({
      key,
      content,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(), // Si ya existe, se sobrescribe pero es aceptable para simplificar
    }, { merge: true });
  }

  async searchMemory(
    query: string
  ): Promise<Array<{ key: string; content: string; created_at: string }>> {
    // Firestore no soporta búsquedas LIKE nativas de forma sencilla sin herramientas externas.
    // Para este caso básico (asumiendo que las memorias no son millones), podemos traer todas y filtrar,
    // o buscar por clave exacta. Haremos un filtrado en memoria por ahora.
    const snapshot = await this.db
      .collection("memories")
      .orderBy("updated_at", "desc")
      .get();

    if (snapshot.empty) return [];

    const lowerQuery = query.toLowerCase();
    const results: Array<{ key: string; content: string; created_at: string }> = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const contentLower = String(data.content || "").toLowerCase();
      const keyLower = String(data.key || "").toLowerCase();

      if (contentLower.includes(lowerQuery) || keyLower.includes(lowerQuery)) {
        results.push({
          key: data.key,
          content: data.content,
          created_at: data.created_at || new Date().toISOString(),
        });
      }
    });

    return results.slice(0, 10);
  }

  async getAllMemories(): Promise<Array<{ key: string; content: string }>> {
    const snapshot = await this.db
      .collection("memories")
      .orderBy("updated_at", "desc")
      .get();

    if (snapshot.empty) return [];

    const results: Array<{ key: string; content: string }> = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      results.push({
        key: data.key,
        content: data.content,
      });
    });

    return results;
  }

  // ─── Historial de conversaciones ──────────────────────

  async addMessage(userId: number, role: string, content: string): Promise<void> {
    await this.db
      .collection("conversations")
      .doc(String(userId))
      .collection("messages")
      .add({
        role,
        content,
        timestamp: new Date().toISOString(),
      });
  }

  async getConversationHistory(
    userId: number,
    limit: number = 20
  ): Promise<Array<{ role: string; content: string }>> {
    const snapshot = await this.db
      .collection("conversations")
      .doc(String(userId))
      .collection("messages")
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    if (snapshot.empty) return [];

    const results: Array<{ role: string; content: string; timestamp: string }> = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      results.push({
        role: data.role,
        content: data.content,
        timestamp: data.timestamp,
      });
    });

    // Como pedimos desc para obtener los últimos, los ordenamos asc para dárselos al LLM
    return results
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((r) => ({
        role: r.role,
        content: r.content,
      }));
  }

  async clearConversation(userId: number): Promise<void> {
    const snapshot = await this.db
      .collection("conversations")
      .doc(String(userId))
      .collection("messages")
      .get();

    if (snapshot.empty) return;

    const batch = this.db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }

  // ─── Cierre limpio ────────────────────────────────────

  close(): void {
    // Firebase no requiere cierre explícito en Node a menos que queramos salir del proceso inmediatamente.
    console.log("💾 Base de datos Firebase (referencia) cerrada");
  }
}
