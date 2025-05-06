let socket;
let username;
let authToken;
let selectedRecipient = null;
let localStream;
let peerConnection;

const configuration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'turn:turnserver.example.org:3478',
      username: 'yourTurnUsername',
      credential: 'yourTurnCredential'
    }
  ]
};

// DOM Elements
const callBtn = document.getElementById("call-btn");
const videoPopup = document.getElementById("video-popup");
const incomingCallPopup = document.getElementById("incoming-call-popup");
const incomingCallText = document.getElementById("incoming-call-text");
const jitsiContainer = document.getElementById("jitsi-container");
const acceptCallBtn = document.getElementById("accept-call-btn");
const declineCallBtn = document.getElementById("decline-call-btn");
const muteBtn = document.getElementById("mute-btn");
const cameraBtn = document.getElementById("camera-btn");
const endCallBtn = document.getElementById("end-call-btn");

console.log("✅ script.js loaded!");

// Create emoji picker container
const emojiPicker = document.createElement("div");
emojiPicker.id = "emoji-picker";
emojiPicker.style.position = "absolute";
emojiPicker.style.background = "#fff";
emojiPicker.style.border = "1px solid #ccc";
emojiPicker.style.padding = "5px";
emojiPicker.style.borderRadius = "5px";
emojiPicker.style.display = "none";
emojiPicker.style.zIndex = "1000";
document.body.appendChild(emojiPicker);

// Expanded list of emojis to show in picker
const emojis = [
  "😀", "😂", "😍", "😢", "😠", "😐", "👍", "🙏", "🎉", "❤️",
  "😎", "🤔", "😇", "😜", "😡", "😭", "😴", "🤗", "😱", "😏",
  "😬", "🤩", "😤", "😪", "😕", "😳", "😵", "🤐", "😷", "🤒"
];

// Populate emoji picker
emojis.forEach(emoji => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = emoji;
  btn.style.fontSize = "20px";
  btn.style.margin = "2px";
  btn.style.border = "none";
  btn.style.background = "transparent";
  btn.style.cursor = "pointer";
  btn.addEventListener("click", () => {
    messageInput.value += emoji;
    messageInput.focus();
    emojiPicker.style.display = "none";
  });
  emojiPicker.appendChild(btn);
});

// Toggle emoji picker on emoji button click with positioning above the button
const emojiBtn = document.getElementById("emoji-btn");
emojiBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (emojiPicker.style.display === "none") {
    // Position emoji picker above the emoji button
    const rect = emojiBtn.getBoundingClientRect();
    emojiPicker.style.left = `${rect.left}px`;
    emojiPicker.style.top = `${rect.top - emojiPicker.offsetHeight - 10}px`;
    emojiPicker.style.display = "block";
  } else {
    emojiPicker.style.display = "none";
  }
});

// Hide emoji picker when clicking outside
document.addEventListener("click", () => {
  emojiPicker.style.display = "none";
});

window.onload = async function () {
  username = localStorage.getItem("username");
  const password = localStorage.getItem("password");

  if (!username || !password) {
    alert("Login info not found. Redirecting to login page.");
    window.location.href = "login.html";
    return;
  }

  document.querySelector(".welcome").textContent = `Welcome, ${username}`;

  try {
    const res = await fetch(`/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    authToken = data.token || "dummy-token";
    connectWebSocket();
  } catch (err) {
    alert("Login failed or session expired.");
    window.location.href = "login.html";
  }
};

function connectWebSocket() {
  socket = new WebSocket("ws://localhost:8000");

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "connect", username, token: authToken }));
  };

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("WebSocket message received:", data);

  if (data.type === "error" && data.message.toLowerCase().includes("spam")) {
    console.log("Spam error detected, showing notification");
    showNotification("Spam detected: Your message was blocked.");
    return;
  }

  handleSocketMessage(event);
};

function showNotification(message) {
  const container = document.getElementById("notification-container");
  if (!container) return;

  const notification = document.createElement("div");
  notification.className = "notification";
  notification.textContent = message;

  container.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("hide");
  }, 2000);

  setTimeout(() => {
    container.removeChild(notification);
  }, 3000);
}
  socket.onerror = () => alert("WebSocket error.");
  socket.onclose = () => console.warn("WebSocket disconnected");
}

async function handleSocketMessage(event) {
  const data = JSON.parse(event.data);

  if (data.type === "updateUsers") {
    const container = document.getElementById("user-items-container");
    container.innerHTML = "";
    data.users.forEach(user => {
      if (user !== username) {
        const el = document.createElement("div");
        el.className = "user-item";
        el.textContent = user;
        el.onclick = async () => {
          selectedRecipient = user;
          document.getElementById("chat-title").textContent = user;
          document.getElementById("chat-box").innerHTML = "";

          if (callBtn) {
            callBtn.onclick = () => {
              if (!selectedRecipient) return alert("Select a user first.");
              socket.send(JSON.stringify({
                type: "jitsi-call",
                from: username,
                to: selectedRecipient
              }));
              videoPopup.classList.remove("hidden");
            };
          }

          try {
            const res = await fetch(`/history?user=${username}&peer=${user}`);
            const messages = await res.json();
            messages.forEach(renderMessage);
          } catch (err) {
            console.error("History fetch error:", err);
          }
        };
        container.appendChild(el);
      }
    });
  }

  else if (data.type === "jitsi-call") {
    incomingCallPopup.classList.remove("hidden");
    incomingCallText.textContent = `${data.from} is calling you...`;

    acceptCallBtn.onclick = () => {
      incomingCallPopup.classList.add("hidden");
      startJitsiCall(data.from);
    };

    declineCallBtn.onclick = () => {
      incomingCallPopup.classList.add("hidden");
    };
  }

  else if (data.type === "message") {
    updateEmoji(data.mood);
    renderMessage(data);
  }

else if (data.type === "typing") {
    showTypingIndicator(data.sender);
    // Update emoji to neutral or typing mood while typing
    updateEmoji("neutral");
  }
}

function renderMessage({ sender, message, timestamp }) {
  const templateId = sender === username ? "message-template-sent" : "message-template-received";
  const template = document.getElementById
  (templateId);
  const clone = template.content.cloneNode(true);

  const contentEl = clone.querySelector(".content");
  const dropdownBtn = clone.querySelector(".dropdown-btn");
  const dropdownMenu = clone.querySelector(".dropdown-menu");
  const languageSelect = clone.querySelector(".language-select");

  contentEl.textContent = message;
  if (sender !== username) clone.querySelector(".sender").textContent = sender;

  const time = new Date(timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  clone.querySelector(".meta").textContent = time;

  // Dropdown toggle
  if (dropdownBtn && dropdownMenu) {
    dropdownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Close other open dropdowns
      document.querySelectorAll(".dropdown-menu").forEach(menu => {
        if (menu !== dropdownMenu) menu.style.display = "none";
      });
      // Toggle this dropdown
      dropdownMenu.style.display = dropdownMenu.style.display === "block" ? "none" : "block";
      // Hide language select when dropdown toggled
      if (languageSelect) languageSelect.style.display = "none";
    });
  }

  // Close dropdowns when clicking outside, but ignore clicks inside dropdown or language select
  document.addEventListener("click", (e) => {
    if (dropdownMenu && !dropdownMenu.contains(e.target) && dropdownBtn !== e.target && !languageSelect?.contains(e.target)) {
      dropdownMenu.style.display = "none";
    }
    if (languageSelect && !languageSelect.contains(e.target) && dropdownBtn !== e.target) {
      languageSelect.style.display = "none";
    }
  });

  // Summarize action
  const summarizeItem = clone.querySelector(".summarize-item");
  if (summarizeItem) {
    summarizeItem.addEventListener("click", async (e) => {
      e.stopPropagation();
      dropdownMenu.style.display = "none";
      contentEl.textContent = "Loading summary...";
      const summarizedText = await summarizeMessage(message);
      contentEl.textContent = summarizedText;
    });
  }

  // Translate action
  const translateItem = clone.querySelector(".translate-item");
  if (translateItem && languageSelect) {
    translateItem.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdownMenu.style.display = "none";
      // Hide all other language selects
      document.querySelectorAll(".language-select").forEach(ls => {
        if (ls !== languageSelect) ls.style.display = "none";
      });
      languageSelect.style.display = languageSelect.style.display === "block" ? "none" : "block";
    });

    languageSelect.addEventListener("change", async () => {
      const targetLang = languageSelect.value;
      if (!targetLang) return;
      languageSelect.style.display = "none";
      contentEl.textContent = "Translating...";
      const translatedText = await translateMessage(message, targetLang);
      contentEl.textContent = translatedText;
    });
  }

  // Copy action
  const copyItem = clone.querySelector(".copy-item");
  if (copyItem) {
    copyItem.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdownMenu.style.display = "none";
      navigator.clipboard.writeText(message).then(() => {
        alert("Message copied to clipboard");
      }).catch(() => {
        alert("Failed to copy message");
      });
    });
  }

  const box = document.getElementById("chat-box");
  box.appendChild(clone);
  box.scrollTop = box.scrollHeight;
}

function updateEmoji(mood) {
  const emojiMap = {
    happy: "😄", sad: "😢", angry: "😠", neutral: "😐"
  };
  document.getElementById("live-emoji").textContent = emojiMap[mood] || "😐";
}

function showTypingIndicator(sender) {
  const id = `typing-${sender}`;
  if (document.getElementById(id)) return;

  const el = document.createElement("div");
  el.id = id;
  el.className = "message status";
  el.textContent = `${sender} is typing...`;
  document.getElementById("chat-box").appendChild(el);

  setTimeout(() => {
    const remove = document.getElementById(id);
    if (remove) remove.remove();
  }, 3000);
}

const sendBtn = document.getElementById("send-btn");
const messageInput = document.getElementById("message");

sendBtn?.addEventListener("click", () => {
  const msg = messageInput.value.trim();
  if (!msg || !selectedRecipient) return;

  const payload = {
    type: "message",
    sender: username,
    recipient: selectedRecipient,
    message: msg,
    timestamp: Date.now()
  };
  socket.send(JSON.stringify(payload));
  renderMessage(payload);
  messageInput.value = "";
});

messageInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendBtn.click();
  else if (selectedRecipient) {
    socket.send(JSON.stringify({
      type: "typing",
      sender: username,
      recipient: selectedRecipient
    }));
  }
});

async function summarizeMessage(message) {
  try {
    const response = await fetch('/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });
    if (!response.ok) throw new Error('Summarization API error');
    const data = await response.json();
    return data.summary || message;
  } catch (error) {
    console.error('SummarizeMessage error:', error);
    return message;
  }
}

async function translateMessage(message, targetLang) {
  try {
    const response = await fetch('/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message, targetLanguage: targetLang })
    });
    if (!response.ok) throw new Error('Translation API error');
    const data = await response.json();
    return data.translation || message;
  } catch (error) {
    console.error('TranslateMessage error:', error);
    return message;
  }
}

// === Jitsi Integration ===
let jitsiApi = null;
function startJitsiCall(caller = username) {
  const roomName = `ChatX-${caller}-${selectedRecipient}`.replace(/\W/g, '');
  const domain = "meet.jit.si";
  const options = {
    roomName: roomName,
    parentNode: document.getElementById("jitsi-container"),
    width: "100%",
    height: 400,
    userInfo: {
      displayName: username
    },
    configOverwrite: {
      startWithVideoMuted: false,
      startWithAudioMuted: false
    },
    interfaceConfigOverwrite: {
      DEFAULT_REMOTE_DISPLAY_NAME: "Fellow ChatX User"
    }
  };
  jitsiApi = new JitsiMeetExternalAPI(domain, options);
  videoPopup.classList.remove("hidden");
}

endCallBtn?.addEventListener("click", () => {
  if (jitsiApi) {
    jitsiApi.dispose();
    jitsiApi = null;
  }
  videoPopup.classList.add("hidden");
});
