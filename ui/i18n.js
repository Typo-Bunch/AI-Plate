/**
 * AI Plate — Client-Side Localization & i18n Engine
 *
 * Provides real-time instant localization across 10 supported languages:
 * English (en), Spanish (es), French (fr), German (de), Hindi (hi),
 * Japanese (ja), Chinese Simplified (zh), Portuguese (pt), Russian (ru), Arabic (ar).
 */

(function () {
  const TRANSLATIONS = {
    en: {
      "app.title": "AI Plate — Open Power",
      "nav.chat": "Chat",
      "nav.kb": "Knowledge Base",
      "nav.artifacts": "Artifacts",
      "nav.settings": "Settings",
      "sidebar.new_chat": "+ New Chat",
      "sidebar.search_chats": "Search chats...",
      "sidebar.recent_sessions": "Recent Sessions",
      "sidebar.collapse": "Collapse Sidebar",
      "topbar.chat": "Chat",
      "topbar.kb": "Knowledge Base",
      "topbar.artifacts": "Artifacts",
      "topbar.idle": "Agent: Idle",
      "topbar.working": "Agent: Working...",
      "topbar.token_stats": "View Full Token Analytics & Ledger",
      "chat.placeholder": "Ask AI Plate anything, type / for quick tools & actions...",
      "chat.send_title": "Send message",
      "chat.ready": "⚡ Ready",
      "chat.hint_send": "to send",
      "chat.hint_stop": "to stop",
      "chat.hint_drop": "Drop files to embed",
      "hero.title": "What would you like to build or explore today?",
      "hero.subtitle": "Open Power Local AI Agent • Fast Inference • Sovereign Personal Memory",
      "hero.chip_market_title": "Live Market Intelligence",
      "hero.chip_market_desc": "Search real-time NZD / INR currency stats",
      "hero.chip_viz_title": "Data Visualization",
      "hero.chip_viz_desc": "Execute Python scripts & generate persistent charts",
      "hero.chip_math_title": "LaTeX Mathematics",
      "hero.chip_math_desc": "Compute proofs and render KaTeX formulas",
      "hero.chip_rag_title": "Vector RAG Query",
      "hero.chip_rag_desc": "Inspect semantic memory & document chunks",
      "kb.title": "Knowledge Base",
      "kb.desc": "Persistent SQLite Vector Store with high-dimensional embeddings.",
      "kb.refresh": "🔄 Refresh",
      "kb.dropzone_title": "Drag & drop documents to ingest into Vector RAG",
      "kb.dropzone_desc": "Supports CSV, Markdown (.md), PDF, Text (.txt), and code files",
      "kb.browse": "Browse Files",
      "kb.th_name": "Document Name",
      "kb.th_chunks": "Chunks",
      "kb.th_chars": "Characters",
      "kb.th_date": "Ingested Date",
      "kb.th_action": "Action",
      "kb.empty": "No documents ingested yet. Drop files above to start semantic search.",
      "artifacts.title": "📦 Artifacts & Deliverables",
      "artifacts.desc": "Persistent storage directory (artifacts/) for meaningful outputs, generated plots, CSV exports, and reports.",
      "artifacts.refresh": "🔄 Refresh",
      "artifacts.clean": "🧹 Clean",
      "settings.modal_title": "Settings & System Configuration",
      "settings.modal_sub": "Manage cognitive directives, LLM models, hot-swappable plugins, and local preferences.",
      "settings.tab_general": "General",
      "settings.tab_models": "Models & Reasoning",
      "settings.tab_skills": "Skills & Directives",
      "settings.tab_plugins": "Plugins & Tools",
      "settings.tab_connectors": "Connectors (MCD)",
      "settings.tab_security": "Security & Guardrails",
      "settings.tab_config": "System Configuration",
      "settings.meta_general_title": "General & Personal Memory",
      "settings.meta_general_desc": "Personalize your butler, configure language & chat interactions, and manage your sovereign Living Dossier.",
      "settings.meta_models_title": "Models & Reasoning",
      "settings.meta_models_desc": "Configure active AI providers, reasoning models, and vector embedding options.",
      "settings.meta_skills_title": "Skills & Cognitive Directives",
      "settings.meta_skills_desc": "Modular reasoning scripts (e.g. humanizer, superpowers TDD & debugging) that shape how the LLM thinks, verifies, and formulates answers.",
      "settings.meta_plugins_title": "Plugins & Tools",
      "settings.meta_plugins_desc": "Real-time hot plug & play tool capabilities for agent execution.",
      "settings.meta_connectors_title": "App Connectors & Integrations",
      "settings.meta_connectors_desc": "Connect to external applications (Blender 3D, OBS Studio, ComfyUI) and control them via AI agent tool calls.",
      "settings.meta_security_title": "Security & Permissions",
      "settings.meta_security_desc": "Manage automated agent permissions, risk boundaries, and interactive approval requests.",
      "settings.meta_config_title": "System Configuration & Secrets",
      "settings.meta_config_desc": "Directly view, modify, and hot-reload config.yaml engine knobs and .env credentials.",
      "general.card_butler": "Butler Identity & Addressing",
      "general.card_butler_sub": "How AI Plate addresses you and conducts conversations.",
      "general.user_name_label": "Your Preferred Name / Title",
      "general.user_name_hint": "AI Plate immediately addresses you with this name across all chat sessions.",
      "general.butler_tone_label": "Butler Demeanor & Tone",
      "general.card_lang": "Language & Regional",
      "general.card_lang_sub": "Customize interface localization and assistant response dialect.",
      "general.ui_lang_label": "Interface Language",
      "general.resp_lang_label": "AI Response Language",
      "general.card_chat": "Chat & Keyboard Interaction",
      "general.card_chat_sub": "Tailor input behavior, scrolling dynamics, and feedback sounds.",
      "general.send_key_label": "Send Message Key",
      "general.send_key_hint": "Choose \"Ctrl+Enter\" if you write long prompts with multiple paragraphs.",
      "general.token_streaming_title": "Real-Time Token Streaming",
      "general.token_streaming_desc": "Stream responses token-by-token with natural character cadence rather than displaying entire paragraphs at once.",
      "general.auto_scroll_title": "Auto-Scroll Chat",
      "general.auto_scroll_desc": "Automatically follow responses as they stream in.",
      "general.audio_cues_title": "Audio Feedback & Chimes",
      "general.audio_cues_desc": "Play subtle soft chimes when tasks or long reasoning steps complete.",
      "general.card_closing": "App Closing & Startup",
      "general.card_closing_sub": "Configure boot behavior, tray minimization, and exit mechanisms.",
      "general.close_action_label": "Window Close Button Action",
      "general.close_action_hint": "Controls what happens when clicking the window ✕ button or pressing Alt+F4.",
      "general.confirm_quit_title": "Confirm Before Quitting",
      "general.confirm_quit_desc": "Show a confirmation prompt before closing to prevent accidental shutdowns.",
      "general.launch_startup_title": "Launch on System Startup",
      "general.launch_startup_desc": "Automatically start AI Plate when logging into your computer.",
      "general.start_minimized_title": "Start Minimized to Tray",
      "general.start_minimized_desc": "Launch quietly in the background without popping open the main window.",
      "general.restore_session_title": "Restore Last Active Session",
      "general.restore_session_desc": "Automatically resume your most recent chat session when launching.",
      "general.quit_app_btn": "Quit AI Plate",
      "general.quit_app_hint": "Need to fully shut down AI Plate right now?",
      "general.card_storage": "Storage & Data Sanctuary",
      "general.card_storage_sub": "All personal memory, documents, and chat records remain 100% on your local machine.",
      "general.db_path_label": "Local SQLite Database Location",
      "general.export_sanctuary": "📥 Export All Data (JSON)",
      "general.clear_cache": "🧹 Clear Session Cache",
      "general.dossier_title": "Sovereign Personal Memory & Living Dossier",
      "general.dossier_sub": "3-Tier Cognitive Memory: Dynamic Conflict Resolution + Behavioral Reflection + On-Device USER_PROFILE.md.",
      "general.auto_learn": "Auto-Learn Memories",
      "general.refresh_dossier": "🔄 Refresh",
      "general.reveal_dossier": "📁 Reveal in Folder",
      "general.wipe_memory": "🗑️ Wipe Memory",
      "general.add_fact": "+ Add Fact",
      "general.pill_facts": "Active Facts",
      "general.pill_reflections": "Learned Habits & Reflections",
      "general.pill_markdown": "USER_PROFILE.md Preview",
      "general.facts_empty": "No personal facts recorded yet. Introduce yourself in chat (e.g. \"My name is Alex\") or click + Add Fact.",
      "general.reflections_empty": "The reflection engine will synthesize working style insights as you talk to your butler.",
      "fact_modal.title": "Commit Permanent Memory Fact",
      "fact_modal.subtitle": "Add a permanent fact to your sovereign Living Dossier.",
      "fact_modal.category": "Category",
      "fact_modal.importance": "Importance (1–10)",
      "fact_modal.key": "Fact Identifier / Key",
      "fact_modal.key_hint": "Used for automatic conflict resolution (updating old facts instead of duplicating).",
      "fact_modal.value": "Fact Value / Description",
      "fact_modal.cancel": "Cancel",
      "fact_modal.submit": "💾 Commit to Memory",
    },

    es: {
      "app.title": "AI Plate — Poder Abierto",
      "nav.chat": "Chat",
      "nav.kb": "Base de Conocimientos",
      "nav.artifacts": "Artefactos",
      "nav.settings": "Configuración",
      "sidebar.new_chat": "+ Nuevo Chat",
      "sidebar.search_chats": "Buscar chats...",
      "sidebar.recent_sessions": "Sesiones Recientes",
      "sidebar.collapse": "Colapsar Barra Lateral",
      "topbar.chat": "Chat",
      "topbar.kb": "Base de Conocimientos",
      "topbar.artifacts": "Artefactos",
      "topbar.idle": "Agente: Inactivo",
      "topbar.working": "Agente: Trabajando...",
      "topbar.token_stats": "Ver Analítica de Tokens y Registro",
      "chat.placeholder": "Pregunta cualquier cosa a AI Plate, escribe / para herramientas rápidas...",
      "chat.send_title": "Enviar mensaje",
      "chat.ready": "⚡ Listo",
      "chat.hint_send": "para enviar",
      "chat.hint_stop": "para detener",
      "chat.hint_drop": "Arrastra archivos para indexar",
      "hero.title": "¿Qué te gustaría crear o explorar hoy?",
      "hero.subtitle": "Agente de IA Local de Código Abierto • Inferencia Rápida • Memoria Personal Soberana",
      "hero.chip_market_title": "Inteligencia de Mercado en Vivo",
      "hero.chip_market_desc": "Consultar estadísticas de divisas en tiempo real",
      "hero.chip_viz_title": "Visualización de Datos",
      "hero.chip_viz_desc": "Ejecutar scripts en Python y generar gráficos",
      "hero.chip_math_title": "Matemáticas LaTeX",
      "hero.chip_math_desc": "Calcular demostraciones y renderizar fórmulas KaTeX",
      "hero.chip_rag_title": "Consulta RAG Vectorial",
      "hero.chip_rag_desc": "Inspeccionar memoria semántica y fragmentos de documentos",
      "kb.title": "Base de Conocimientos",
      "kb.desc": "Almacén vectorial SQLite persistente con incrustaciones de alta dimensión.",
      "kb.refresh": "🔄 Actualizar",
      "kb.dropzone_title": "Arrastra y suelta documentos para indexar en RAG Vectorial",
      "kb.dropzone_desc": "Soporta CSV, Markdown (.md), PDF, Texto (.txt) y código",
      "kb.browse": "Examinar Archivos",
      "kb.th_name": "Nombre del Documento",
      "kb.th_chunks": "Fragmentos",
      "kb.th_chars": "Caracteres",
      "kb.th_date": "Fecha de Ingesta",
      "kb.th_action": "Acción",
      "kb.empty": "No hay documentos ingestados aún. Arrastra archivos arriba para iniciar búsqueda semántica.",
      "artifacts.title": "📦 Artefactos y Entregables",
      "artifacts.desc": "Directorio de almacenamiento persistente (artifacts/) para resultados, gráficos generados y reportes.",
      "artifacts.refresh": "🔄 Actualizar",
      "artifacts.clean": "🧹 Limpiar",
      "settings.modal_title": "Configuración del Sistema",
      "settings.modal_sub": "Gestiona directivas cognitivas, modelos LLM, complementos y preferencias locales.",
      "settings.tab_general": "General",
      "settings.tab_models": "Modelos y Razonamiento",
      "settings.tab_skills": "Habilidades y Directivas",
      "settings.tab_plugins": "Complementos y Herramientas",
      "settings.tab_connectors": "Conectores (MCD)",
      "settings.tab_security": "Seguridad y Permisos",
      "settings.tab_config": "Configuración del Sistema",
      "settings.meta_general_title": "General y Memoria Personal",
      "settings.meta_general_desc": "Personaliza tu mayordomo, configura idioma e interacciones, y gestiona tu Dossier Soberano.",
      "general.card_butler": "Identidad del Mayordomo y Saludo",
      "general.card_butler_sub": "Cómo te llama AI Plate y conduce las conversaciones.",
      "general.user_name_label": "Tu Nombre o Título Preferido",
      "general.user_name_hint": "AI Plate se dirigirá a ti de inmediato con este nombre en todas las sesiones.",
      "general.butler_tone_label": "Comportamiento y Tono del Mayordomo",
      "general.card_lang": "Idioma y Región",
      "general.card_lang_sub": "Personaliza la localización de la interfaz y el dialecto de respuesta.",
      "general.ui_lang_label": "Idioma de la Interfaz",
      "general.resp_lang_label": "Idioma de Respuesta de la IA",
      "general.card_chat": "Interacción de Chat y Teclado",
      "general.card_chat_sub": "Adapta la entrada de texto, desplazamiento y sonidos.",
      "general.send_key_label": "Tecla para Enviar Mensaje",
      "general.send_key_hint": "Elige \"Ctrl+Enter\" si redactas mensajes largos con varios párrafos.",
      "general.token_streaming_title": "Transmisión de Tokens en Tiempo Real",
      "general.token_streaming_desc": "Muestra las respuestas carácter por carácter con cadencia natural en lugar de mostrar párrafos enteros de golpe.",
      "general.auto_scroll_title": "Desplazamiento Automático",
      "general.auto_scroll_desc": "Sigue las respuestas automáticamente a medida que se transmiten.",
      "general.audio_cues_title": "Sonidos de Notificación",
      "general.audio_cues_desc": "Reproduce suaves timbres al completar tareas o razonamientos largos.",
      "general.card_closing": "Cierre y Arranque de la Aplicación",
      "general.card_closing_sub": "Configura el inicio con el sistema, minimización a bandeja y salida.",
      "general.close_action_label": "Acción del Botón de Cerrar Ventana",
      "general.close_action_hint": "Controla qué ocurre al hacer clic en la ✕ o pulsar Alt+F4.",
      "general.confirm_quit_title": "Confirmar Antes de Salir",
      "general.confirm_quit_desc": "Mostrar un cuadro de confirmación para evitar cierres accidentales.",
      "general.launch_startup_title": "Iniciar al Encender el Equipo",
      "general.launch_startup_desc": "Inicia AI Plate automáticamente al iniciar sesión en el ordenador.",
      "general.start_minimized_title": "Iniciar Minimizado en Bandeja",
      "general.start_minimized_desc": "Inicia silenciosamente en segundo plano sin desplegar la ventana principal.",
      "general.restore_session_title": "Restaurar Última Sesión Activa",
      "general.restore_session_desc": "Reanuda automáticamente tu chat más reciente al iniciar.",
      "general.quit_app_btn": "Salir de AI Plate",
      "general.quit_app_hint": "¿Necesitas apagar AI Plate por completo ahora mismo?",
      "general.card_storage": "Almacenamiento y Santuario de Datos",
      "general.card_storage_sub": "Toda la memoria personal, documentos y registros residen 100% en tu máquina local.",
      "general.db_path_label": "Ubicación de la Base de Datos SQLite",
      "general.export_sanctuary": "📥 Exportar Todos los Datos (JSON)",
      "general.clear_cache": "🧹 Limpiar Caché de Sesión",
      "general.dossier_title": "Memoria Personal Soberana y Dossier Vivo",
      "general.dossier_sub": "Memoria cognitiva de 3 niveles: Resolución de conflictos + Reflexión + USER_PROFILE.md local.",
      "general.auto_learn": "Auto-Aprender Recuerdos",
      "general.refresh_dossier": "🔄 Actualizar",
      "general.reveal_dossier": "📁 Mostrar en Carpeta",
      "general.wipe_memory": "🗑️ Borrar Memoria",
      "general.add_fact": "+ Agregar Hecho",
      "general.pill_facts": "Hechos Activos",
      "general.pill_reflections": "Hábitos y Reflexiones",
      "general.pill_markdown": "Vista Previa USER_PROFILE.md",
      "general.facts_empty": "No hay hechos registrados aún. Preséntate en el chat (ej. \"Mi nombre es Alex\") o haz clic en + Agregar Hecho.",
      "general.reflections_empty": "El motor de reflexión sintetizará tus hábitos de trabajo a medida que hables con tu mayordomo.",
      "fact_modal.title": "Guardar Hecho en Memoria Permanente",
      "fact_modal.subtitle": "Agrega un hecho permanente a tu Dossier Personal Soberano.",
      "fact_modal.category": "Categoría",
      "fact_modal.importance": "Importancia (1–10)",
      "fact_modal.key": "Clave / Identificador del Hecho",
      "fact_modal.key_hint": "Utilizado para la resolución automática de conflictos en lugar de duplicar.",
      "fact_modal.value": "Valor / Descripción del Hecho",
      "fact_modal.cancel": "Cancelar",
      "fact_modal.submit": "💾 Guardar en Memoria",
    },

    fr: {
      "app.title": "AI Plate — Puissance Ouverte",
      "nav.chat": "Discussion",
      "nav.kb": "Base de Connaissances",
      "nav.artifacts": "Artefacts",
      "nav.settings": "Paramètres",
      "sidebar.new_chat": "+ Nouvelle Discussion",
      "sidebar.search_chats": "Rechercher des discussions...",
      "sidebar.recent_sessions": "Sessions Récentes",
      "sidebar.collapse": "Réduire la barre latérale",
      "topbar.chat": "Discussion",
      "topbar.kb": "Base de Connaissances",
      "topbar.artifacts": "Artefacts",
      "topbar.idle": "Agent : En attente",
      "topbar.working": "Agent : En cours...",
      "topbar.token_stats": "Consulter les statistiques de jetons et le registre",
      "chat.placeholder": "Posez une question à AI Plate, tapez / pour les outils rapides...",
      "chat.send_title": "Envoyer le message",
      "chat.ready": "⚡ Prêt",
      "chat.hint_send": "pour envoyer",
      "chat.hint_stop": "pour arrêter",
      "chat.hint_drop": "Glissez des fichiers pour indexer",
      "hero.title": "Que souhaitez-vous concevoir ou explorer aujourd'hui ?",
      "hero.subtitle": "Agent IA Local et Souverain • Inférence Ultra-Rapide • Mémoire Personnelle Durable",
      "kb.title": "Base de Connaissances",
      "kb.desc": "Base vectorielle SQLite persistante avec plongements sémantiques haute dimension.",
      "kb.refresh": "🔄 Actualiser",
      "kb.browse": "Parcourir les Fichiers",
      "artifacts.title": "📦 Artefacts et Livrables",
      "settings.modal_title": "Paramètres & Configuration Système",
      "settings.tab_general": "Général",
      "settings.tab_models": "Modèles & Raisonnement",
      "settings.tab_skills": "Compétences & Directives",
      "settings.tab_plugins": "Plugins & Outils",
      "settings.meta_general_title": "Général & Mémoire Personnelle",
      "general.card_butler": "Identité du Majordome & Civilités",
      "general.user_name_label": "Votre Nom ou Titre Préféré",
      "general.butler_tone_label": "Attitude & Tonalité du Majordome",
      "general.card_lang": "Langue & Région",
      "general.ui_lang_label": "Langue de l'Interface",
      "general.resp_lang_label": "Langue des Réponses de l'IA",
      "general.card_chat": "Interaction & Clavier",
      "general.send_key_label": "Raccourci d'Envoi",
      "general.auto_scroll_title": "Défilement Automatique",
      "general.audio_cues_title": "Retours Sonores",
      "general.card_closing": "Fermeture & Démarrage",
      "general.close_action_label": "Action à la Fermeture de la Fenêtre",
      "general.confirm_quit_title": "Confirmer Avant de Quitter",
      "general.launch_startup_title": "Lancer au Démarrage du Système",
      "general.start_minimized_title": "Démarrer Réduit dans la Barre des Tâches",
      "general.restore_session_title": "Restaurer la Dernière Session",
      "general.quit_app_btn": "Quitter AI Plate",
      "general.card_storage": "Stockage & Sanctuaire de Données",
      "general.export_sanctuary": "📥 Exporter les Données (JSON)",
      "general.clear_cache": "🧹 Vider le Cache de Session",
      "general.dossier_title": "Mémoire Personnelle Souveraine & Dossier Vivant",
      "general.auto_learn": "Apprentissage Automatique",
      "general.refresh_dossier": "🔄 Actualiser",
      "general.reveal_dossier": "📁 Afficher dans le Dossier",
      "general.wipe_memory": "🗑️ Effacer la Mémoire",
      "general.add_fact": "+ Ajouter un Fait",
    },

    de: {
      "app.title": "AI Plate — Freie Stärke",
      "nav.chat": "Chat",
      "nav.kb": "Wissensdatenbank",
      "nav.artifacts": "Artefakte",
      "nav.settings": "Einstellungen",
      "sidebar.new_chat": "+ Neuer Chat",
      "sidebar.search_chats": "Chats durchsuchen...",
      "sidebar.recent_sessions": "Letzte Sitzungen",
      "topbar.chat": "Chat",
      "topbar.kb": "Wissensdatenbank",
      "topbar.artifacts": "Artefakte",
      "topbar.idle": "Agent: Bereit",
      "topbar.working": "Agent: Arbeitet...",
      "chat.placeholder": "Fragen Sie AI Plate etwas, / für Schnellwerkzeuge tippen...",
      "chat.send_title": "Nachricht senden",
      "chat.ready": "⚡ Bereit",
      "chat.hint_send": "zum Senden",
      "chat.hint_stop": "zum Anhalten",
      "hero.title": "Was möchten Sie heute entwickeln oder erkunden?",
      "hero.subtitle": "Lokaler Open-Source-KI-Agent • Schnelle Inferenz • Souveränes Gedächtnis",
      "settings.modal_title": "Einstellungen & Systemkonfiguration",
      "settings.tab_general": "Allgemein",
      "settings.tab_models": "Modelle & Denkweise",
      "settings.tab_skills": "Fähigkeiten & Direktiven",
      "settings.meta_general_title": "Allgemein & Persönliches Gedächtnis",
      "general.card_butler": "Butler-Identität & Anrede",
      "general.user_name_label": "Ihr bevorzugter Name / Titel",
      "general.butler_tone_label": "Butler-Auftreten & Tonfall",
      "general.card_lang": "Sprache & Region",
      "general.ui_lang_label": "Benutzeroberflächen-Sprache",
      "general.resp_lang_label": "Antwortsprache der KI",
      "general.card_chat": "Chat & Tastatur-Interaktion",
      "general.send_key_label": "Nachricht senden mit",
      "general.card_closing": "Schließen & Systemstart",
      "general.close_action_label": "Verhalten beim Schließen des Fensters",
      "general.confirm_quit_title": "Vor dem Beenden bestätigen",
      "general.launch_startup_title": "Mit dem Betriebssystem starten",
      "general.start_minimized_title": "Minimiert im Tray starten",
      "general.restore_session_title": "Letzte Sitzung wiederherstellen",
      "general.quit_app_btn": "AI Plate beenden",
      "general.card_storage": "Datenspeicher & Schutzbereich",
      "general.dossier_title": "Souveränes Persönliches Dossier",
      "general.add_fact": "+ Fakt hinzufügen",
      "general.wipe_memory": "🗑️ Gedächtnis löschen",
    },

    hi: {
      "app.title": "AI Plate — मुक्त सामर्थ्य",
      "nav.chat": "बातचीत",
      "nav.kb": "ज्ञानकोश",
      "nav.artifacts": "कलाकृतियां",
      "nav.settings": "सेटिंग्स",
      "sidebar.new_chat": "+ नई बातचीत",
      "sidebar.search_chats": "चैट खोजें...",
      "sidebar.recent_sessions": "हाल की बातचीत",
      "topbar.chat": "बातचीत",
      "topbar.kb": "ज्ञानकोश",
      "topbar.artifacts": "कलाकृतियां",
      "topbar.idle": "एजेंट: निष्क्रिय",
      "topbar.working": "एजेंट: कार्य प्रगति पर...",
      "chat.placeholder": "AI Plate से कुछ भी पूछें, त्वरित टूल्स के लिए / टाइप करें...",
      "chat.send_title": "संदेश भेजें",
      "chat.ready": "⚡ तैयार",
      "chat.hint_send": "भेजने के लिए",
      "chat.hint_stop": "रोकने के लिए",
      "hero.title": "आज आप क्या बनाना या खोजना चाहेंगे?",
      "hero.subtitle": "ओपन पावर लोकल एआई एजेंट • तीव्र प्रतिक्रिया • संप्रभु व्यक्तिगत स्मृति",
      "settings.modal_title": "सेटिंग्स और सिस्टम विन्यास",
      "settings.tab_general": "सामान्य",
      "settings.tab_models": "मॉडल और तर्क",
      "settings.tab_skills": "कौशल और निर्देश",
      "settings.meta_general_title": "सामान्य और व्यक्तिगत स्मृति",
      "general.card_butler": "बटलर पहचान और संबोधन",
      "general.user_name_label": "आपका पसंदीदा नाम या पदवी",
      "general.butler_tone_label": "बटलर का व्यवहार और शैली",
      "general.card_lang": "भाषा और क्षेत्रीय सेटिंग्स",
      "general.ui_lang_label": "इंटरफ़ेस भाषा",
      "general.resp_lang_label": "एआई उत्तर भाषा",
      "general.card_chat": "चैट और कीबोर्ड सेटिंग्स",
      "general.send_key_label": "संदेश भेजने की कुंजी",
      "general.card_closing": "ऐप बंद और प्रारंभ विकल्प",
      "general.close_action_label": "विंडो बंद करने पर क्रिया",
      "general.confirm_quit_title": "बंद करने से पहले पुष्टि करें",
      "general.launch_startup_title": "कंप्यूटर शुरू होते ही प्रारंभ करें",
      "general.start_minimized_title": "ट्रे में छोटा करके प्रारंभ करें",
      "general.restore_session_title": "पिछला सत्र पुनर्स्थापित करें",
      "general.quit_app_btn": "AI Plate बंद करें",
      "general.card_storage": "डेटा संरक्षण एवं भंडारण",
      "general.dossier_title": "संप्रभु व्यक्तिगत स्मृति और जीवंत प्रोफ़ाइल",
      "general.add_fact": "+ तथ्य जोड़ें",
      "general.wipe_memory": "🗑️ स्मृति मिटाएं",
    },

    ja: {
      "app.title": "AI Plate — オープンパワー",
      "nav.chat": "チャット",
      "nav.kb": "ナレッジベース",
      "nav.artifacts": "アーティファクト",
      "nav.settings": "設定",
      "sidebar.new_chat": "+ 新規チャット",
      "sidebar.search_chats": "チャットを検索...",
      "sidebar.recent_sessions": "最近のセッション",
      "topbar.chat": "チャット",
      "topbar.kb": "ナレッジベース",
      "topbar.artifacts": "成果物",
      "topbar.idle": "エージェント: 待機中",
      "topbar.working": "エージェント: 処理中...",
      "chat.placeholder": "AI Plateに何でも質問してください。/ でツール一覧...",
      "chat.send_title": "メッセージを送信",
      "chat.ready": "⚡ 準備完了",
      "chat.hint_send": "送信",
      "chat.hint_stop": "停止",
      "hero.title": "今日は何を作成、または調査しますか？",
      "hero.subtitle": "ローカルAIエージェント • 超高速推論 • 主権的パーソナルメモリ",
      "settings.modal_title": "設定とシステム構成",
      "settings.tab_general": "一般",
      "settings.tab_models": "モデルと推論",
      "settings.tab_skills": "スキルと指示",
      "settings.meta_general_title": "一般＆パーソナルメモリ",
      "general.card_butler": "執事の呼称とトーン",
      "general.user_name_label": "ご希望のお名前 / 敬称",
      "general.butler_tone_label": "執事の振る舞い・語調",
      "general.card_lang": "言語と地域",
      "general.ui_lang_label": "UI言語",
      "general.resp_lang_label": "AI応答言語",
      "general.card_chat": "チャットとキーボード操作",
      "general.send_key_label": "送信ショートカットキー",
      "general.card_closing": "終了と起動動作",
      "general.close_action_label": "ウィンドウを閉じる際のアクション",
      "general.confirm_quit_title": "終了前に確認ダイアログを表示",
      "general.launch_startup_title": "システム起動時に自動実行",
      "general.start_minimized_title": "トレイに最小化した状態で起動",
      "general.restore_session_title": "最後のセッションを復元",
      "general.quit_app_btn": "AI Plateを終了",
      "general.card_storage": "ローカルデータ保管庫",
      "general.dossier_title": "自己主権型パーソナル記憶・リビングドシエ",
      "general.add_fact": "+ 情報を追加",
      "general.wipe_memory": "🗑️ 記憶を消去",
    },

    zh: {
      "app.title": "AI Plate — 开源全能",
      "nav.chat": "对话",
      "nav.kb": "知识库",
      "nav.artifacts": "交付物",
      "nav.settings": "设置",
      "sidebar.new_chat": "+ 新建对话",
      "sidebar.search_chats": "搜索对话...",
      "sidebar.recent_sessions": "最近会话",
      "topbar.chat": "对话",
      "topbar.kb": "知识库",
      "topbar.artifacts": "工件库",
      "topbar.idle": "智能体: 空闲",
      "topbar.working": "智能体: 处理中...",
      "chat.placeholder": "向 AI Plate 提问任何内容，输入 / 调出快捷工具...",
      "chat.send_title": "发送消息",
      "chat.ready": "⚡ 就绪",
      "chat.hint_send": "发送",
      "chat.hint_stop": "停止",
      "hero.title": "今天您想构建或探索什么？",
      "hero.subtitle": "本地开源AI智能体 • 极速推理 • 主权个人记忆圣殿",
      "settings.modal_title": "设置与系统配置",
      "settings.tab_general": "通用",
      "settings.tab_models": "模型与推理",
      "settings.tab_skills": "技能与认知脚本",
      "settings.meta_general_title": "通用设置与专属记忆",
      "general.card_butler": "管家称谓与语气",
      "general.user_name_label": "您的姓名 / 称谓",
      "general.butler_tone_label": "管家语气风格",
      "general.card_lang": "语言与区域",
      "general.ui_lang_label": "界面语言",
      "general.resp_lang_label": "AI回复语言",
      "general.card_chat": "输入与键盘偏好",
      "general.send_key_label": "发送快捷键",
      "general.card_closing": "退出机制与开机启动",
      "general.close_action_label": "关闭窗口按钮行为",
      "general.confirm_quit_title": "退出前弹出确认框",
      "general.launch_startup_title": "开机自动启动",
      "general.start_minimized_title": "启动时最小化到托盘",
      "general.restore_session_title": "自动恢复上次对话",
      "general.quit_app_btn": "退出 AI Plate",
      "general.card_storage": "本地存储与数据安全",
      "general.dossier_title": "主权个人记忆与动态档案",
      "general.add_fact": "+ 添加记忆点",
      "general.wipe_memory": "🗑️ 清空专属记忆",
    },

    pt: {
      "app.title": "AI Plate — Poder Aberto",
      "nav.chat": "Chat",
      "nav.kb": "Base de Conhecimento",
      "nav.artifacts": "Artefatos",
      "nav.settings": "Configurações",
      "sidebar.new_chat": "+ Novo Chat",
      "sidebar.search_chats": "Buscar conversas...",
      "sidebar.recent_sessions": "Sessões Recentes",
      "topbar.chat": "Chat",
      "topbar.kb": "Base de Conhecimento",
      "topbar.artifacts": "Artefatos",
      "topbar.idle": "Agente: Ocioso",
      "topbar.working": "Agente: Trabalhando...",
      "chat.placeholder": "Pergunte qualquer coisa ao AI Plate, digite / para ferramentas...",
      "chat.send_title": "Enviar mensagem",
      "chat.ready": "⚡ Pronto",
      "chat.hint_send": "para enviar",
      "chat.hint_stop": "para parar",
      "hero.title": "O que você gostaria de construir ou explorar hoje?",
      "hero.subtitle": "Agente de IA Local de Código Aberto • Inferência Rápida • Memória Pessoal Soberana",
      "settings.modal_title": "Configurações e Sistema",
      "settings.tab_general": "Geral",
      "settings.tab_models": "Modelos & Raciocínio",
      "settings.meta_general_title": "Geral & Memória Pessoal",
      "general.card_butler": "Identidade e Tratamento do Mordomo",
      "general.user_name_label": "Seu Nome ou Título Preferido",
      "general.butler_tone_label": "Tom e Postura do Mordomo",
      "general.card_lang": "Idioma e Região",
      "general.ui_lang_label": "Idioma da Interface",
      "general.resp_lang_label": "Idioma de Resposta da IA",
      "general.card_chat": "Interação de Chat e Teclado",
      "general.send_key_label": "Tecla de Envio",
      "general.card_closing": "Fechamento e Inicialização",
      "general.close_action_label": "Ação ao Fechar Janela",
      "general.confirm_quit_title": "Confirmar Antes de Sair",
      "general.launch_startup_title": "Iniciar com o Sistema",
      "general.start_minimized_title": "Iniciar Minimizado na Bandeja",
      "general.restore_session_title": "Restaurar Última Sessão",
      "general.quit_app_btn": "Sair do AI Plate",
      "general.card_storage": "Armazenamento e Santuário Local",
      "general.dossier_title": "Memória Pessoal Soberana e Dossiê Vivo",
      "general.add_fact": "+ Adicionar Fato",
      "general.wipe_memory": "🗑️ Limpar Memória",
    },

    ru: {
      "app.title": "AI Plate — Открытая Мощь",
      "nav.chat": "Чат",
      "nav.kb": "База знаний",
      "nav.artifacts": "Артефакты",
      "nav.settings": "Настройки",
      "sidebar.new_chat": "+ Новый чат",
      "sidebar.search_chats": "Поиск чатов...",
      "sidebar.recent_sessions": "Недавние сессии",
      "topbar.chat": "Чат",
      "topbar.kb": "База знаний",
      "topbar.artifacts": "Артефакты",
      "topbar.idle": "Агент: Ожидание",
      "topbar.working": "Агент: Работает...",
      "chat.placeholder": "Спросите AI Plate о чем угодно, введите / для инструментов...",
      "chat.send_title": "Отправить сообщение",
      "chat.ready": "⚡ Готов",
      "chat.hint_send": "отправить",
      "chat.hint_stop": "остановить",
      "hero.title": "Что вы хотите создать или исследовать сегодня?",
      "hero.subtitle": "Локальный ИИ-агент • Быстрый вывод • Суверенная личная память",
      "settings.modal_title": "Настройки и конфигурация",
      "settings.tab_general": "Общие",
      "settings.tab_models": "Модели и рассуждения",
      "settings.meta_general_title": "Общие и личная память",
      "general.card_butler": "Личность дворецкого и обращение",
      "general.user_name_label": "Ваше имя или обращение",
      "general.butler_tone_label": "Тон и манера дворецкого",
      "general.card_lang": "Язык и регион",
      "general.ui_lang_label": "Язык интерфейса",
      "general.resp_lang_label": "Язык ответов ИИ",
      "general.card_chat": "Ввод и клавиатура",
      "general.send_key_label": "Клавиша отправки",
      "general.card_closing": "Закрытие и автозапуск",
      "general.close_action_label": "Действие при закрытии окна",
      "general.confirm_quit_title": "Подтверждать выход",
      "general.launch_startup_title": "Запуск при старте системы",
      "general.start_minimized_title": "Запуск свернутым в трей",
      "general.restore_session_title": "Восстанавливать последнюю сессию",
      "general.quit_app_btn": "Выйти из AI Plate",
      "general.card_storage": "Хранилище данных",
      "general.dossier_title": "Суверенное личное досье",
      "general.add_fact": "+ Добавить факт",
      "general.wipe_memory": "🗑️ Очистить память",
    },

    ar: {
      "app.title": "AI Plate — القوة المفتوحة",
      "nav.chat": "المحادثة",
      "nav.kb": "قاعدة المعرفة",
      "nav.artifacts": "المخرجات",
      "nav.settings": "الإعدادات",
      "sidebar.new_chat": "+ محادثة جديدة",
      "sidebar.search_chats": "بحث في المحادثات...",
      "sidebar.recent_sessions": "الجلسات الأخيرة",
      "topbar.chat": "المحادثة",
      "topbar.kb": "قاعدة المعرفة",
      "topbar.artifacts": "المخرجات",
      "topbar.idle": "الوكيل: خامل",
      "topbar.working": "الوكيل: قيد المعالجة...",
      "chat.placeholder": "اسأل AI Plate أي شيء، اكتب / للأدوات السريعة...",
      "chat.send_title": "إرسال الرسالة",
      "chat.ready": "⚡ جاهز",
      "chat.hint_send": "للإرسال",
      "chat.hint_stop": "للإيقاف",
      "hero.title": "ماذا تود أن تبني أو تستكشف اليوم؟",
      "hero.subtitle": "وكيل ذكاء اصطناعي محلي حر • استنتاج فائق السرعة • ذاكرة شخصية سيادية",
      "settings.modal_title": "الإعدادات وتكوين النظام",
      "settings.tab_general": "عام",
      "settings.tab_models": "النماذج والاستدلال",
      "settings.meta_general_title": "عام والذاكرة الشخصية",
      "general.card_butler": "هوية المساعد وأسلوب الخطاب",
      "general.user_name_label": "اسمك أو لقبك المفضل",
      "general.butler_tone_label": "نبرة وأسلوب المساعد",
      "general.card_lang": "اللغة والمنطقة",
      "general.ui_lang_label": "لغة الواجهة",
      "general.resp_lang_label": "لغة إجابات الذكاء الاصطناعي",
      "general.card_chat": "تفاعل المحادثة ولوحة المفاتيح",
      "general.send_key_label": "مفتاح إرسال الرسالة",
      "general.card_closing": "آلية الإغلاق وبدء التشغيل",
      "general.close_action_label": "إجراء زر إغلاق النافذة",
      "general.confirm_quit_title": "تأكيد الإغلاق قبل الخروج",
      "general.launch_startup_title": "تشغيل تلقائي مع بدء النظام",
      "general.start_minimized_title": "بدء التشغيل مصغراً في شريط المهام",
      "general.restore_session_title": "استعادة الجلسة السابقة",
      "general.quit_app_btn": "إغلاق AI Plate",
      "general.card_storage": "ملاذ تخزين البيانات المحلي",
      "general.dossier_title": "الملف الشخصي والذاكرة السيادية",
      "general.add_fact": "+ إضافة معلومة",
      "general.wipe_memory": "🗑️ مسح الذاكرة",
    },
  };

  let currentLang = localStorage.getItem("ai_plate_ui_language") || "en";

  function t(key, lang = currentLang) {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    return dict[key] || TRANSLATIONS.en[key] || key;
  }

  function applyLanguage(lang) {
    if (!TRANSLATIONS[lang]) lang = "en";
    currentLang = lang;
    localStorage.setItem("ai_plate_ui_language", lang);

    document.documentElement.lang = lang;
    if (lang === "ar") {
      document.documentElement.setAttribute("dir", "rtl");
    } else {
      document.documentElement.setAttribute("dir", "ltr");
    }

    // 1. Translate elements with data-i18n
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = t(key, lang);
      if (val) el.textContent = val;
    });

    // 2. Translate placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = t(key, lang);
      if (val) el.placeholder = val;
    });

    // 3. Direct DOM mappings for high-visibility UI components
    const safeSetText = (sel, key) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = t(key, lang);
    };

    const safeSetPlaceholder = (sel, key) => {
      const el = document.querySelector(sel);
      if (el) el.placeholder = t(key, lang);
    };

    // Topbar & Navigation
    safeSetText("#tab-nav-chat span", "nav.chat");
    safeSetText("#tab-nav-kb span", "nav.kb");
    safeSetText("#tab-nav-sandbox span", "nav.artifacts");
    safeSetText("#tab-nav-settings span", "nav.settings");
    safeSetText("#btn-new-chat", "sidebar.new_chat");
    safeSetPlaceholder("#search-sessions-input", "sidebar.search_chats");
    safeSetText(".sidebar-section-title", "sidebar.recent_sessions");
    safeSetPlaceholder("#user-input", "chat.placeholder");

    // Chat Dropzone
    safeSetText(".chat-dropzone .dropzone-title", "chat.dropzone_title");
    safeSetText(".chat-dropzone .dropzone-subtitle", "chat.dropzone_sub");

    // Hero Cards
    safeSetText(".hero-title", "hero.title");
    safeSetText(".hero-subtitle", "hero.subtitle");

    // Knowledge Base View
    safeSetText("#tab-kb .view-title", "kb.title");
    safeSetText("#kb-tagline", "kb.desc");
    safeSetText("#btn-refresh-kb", "kb.refresh");
    safeSetText("#kb-dropzone .dropzone-title", "kb.dropzone_title");
    safeSetText("#kb-dropzone .dropzone-desc", "kb.dropzone_desc");
    safeSetText("#btn-browse-kb", "kb.browse");

    // Settings Modal Tabs
    safeSetText('[data-settings-tab="tab-settings-general"] .settings-tab-name', "settings.tab_general");
    safeSetText('[data-settings-tab="tab-settings-models"] .settings-tab-name', "settings.tab_models");
    safeSetText('[data-settings-tab="tab-settings-skills"] .settings-tab-name', "settings.tab_skills");
    safeSetText('[data-settings-tab="tab-settings-plugins"] .settings-tab-name', "settings.tab_plugins");
    safeSetText('[data-settings-tab="tab-settings-connectors"] .settings-tab-name', "settings.tab_connectors");
    safeSetText('[data-settings-tab="tab-settings-security"] .settings-tab-name', "settings.tab_security");
    safeSetText('[data-settings-tab="tab-settings-system-config"] .settings-tab-name', "settings.tab_config");

    // General Tab Cards
    safeSetText("#tab-settings-general .settings-card:nth-child(1) .card-head h3", "general.card_butler");
    safeSetText("#tab-settings-general .settings-card:nth-child(1) .card-sub", "general.card_butler_sub");
    safeSetText('label[for="general-user-name"]', "general.user_name_label");
    safeSetText('label[for="general-butler-tone"]', "general.butler_tone_label");

    safeSetText("#tab-settings-general .settings-card:nth-child(2) .card-head h3", "general.card_lang");
    safeSetText("#tab-settings-general .settings-card:nth-child(2) .card-sub", "general.card_lang_sub");
    safeSetText('label[for="general-ui-language"]', "general.ui_lang_label");
    safeSetText('label[for="general-response-language"]', "general.resp_lang_label");

    safeSetText("#tab-settings-general .settings-card:nth-child(3) .card-head h3", "general.card_chat");
    safeSetText("#tab-settings-general .settings-card:nth-child(3) .card-sub", "general.card_chat_sub");
    safeSetText('label[for="general-send-shortcut"]', "general.send_key_label");

    safeSetText("#tab-settings-general .settings-card:nth-child(4) .card-head h3", "general.card_closing");
    safeSetText("#tab-settings-general .settings-card:nth-child(4) .card-sub", "general.card_closing_sub");
    safeSetText('label[for="general-close-action"]', "general.close_action_label");

    safeSetText("#tab-settings-general .settings-card:nth-child(5) .card-head h3", "general.card_storage");
    safeSetText("#tab-settings-general .settings-card:nth-child(5) .card-sub", "general.card_storage_sub");

    // Dossier Card
    safeSetText(".dossier-title", "general.dossier_title");
    safeSetText(".dossier-sub", "general.dossier_sub");
    safeSetText(".dossier-auto-learn-label span", "general.auto_learn");
    safeSetText("#btn-refresh-dossier span", "general.refresh_dossier");
    safeSetText("#btn-open-dossier-file span", "general.reveal_dossier");
    safeSetText("#btn-wipe-dossier span", "general.wipe_memory");
    safeSetText("#btn-add-fact-trigger span", "general.add_fact");

    // Update settings header if General is active
    const activeTab = document.querySelector(".settings-tab-pane.active");
    if (activeTab && activeTab.id === "tab-settings-general") {
      const vTitle = document.getElementById("settings-view-title");
      const vDesc = document.getElementById("settings-view-desc");
      if (vTitle) vTitle.textContent = t("settings.meta_general_title", lang);
      if (vDesc) vDesc.textContent = t("settings.meta_general_desc", lang);
    }

    // Dispatch event
    window.dispatchEvent(new CustomEvent("ai-plate-language-changed", { detail: { lang } }));
  }

  // Expose global API
  window.AIPlateI18n = {
    t,
    applyLanguage,
    getCurrentLanguage: () => currentLang,
    getSupportedLanguages: () => Object.keys(TRANSLATIONS),
  };

  // Auto-apply on script load
  document.addEventListener("DOMContentLoaded", () => {
    applyLanguage(currentLang);
  });
})();
