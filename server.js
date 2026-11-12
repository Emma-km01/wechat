const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const serveur = http.createServer(app);
const io = new Server(serveur);

app.use(express.static("pages"));

// Les discussions 
const salons = [
  { id: "general", nom: "Général" },
  { id: "blockchain", nom: "Blockchain" },
  { id: "entraide", nom: "Entraide code" },
];

// Historique en mémoire : id du salon -> liste de messages (100 max)
const historique = {};
for (const salon of salons) historique[salon.id] = [];

// id de socket -> pseudo
const connectes = new Map();

const salonExiste = (id) => salons.some((s) => s.id === id);

io.on("connection", (socket) => {
  // 1) Le pseudo est choisi : on rejoint toutes les rooms et on reçoit les historiques
  socket.on("rejoindre", (pseudo) => {
    const nom = String(pseudo || "").trim().slice(0, 20) || "Anonyme";
    connectes.set(socket.id, nom);

    for (const salon of salons) socket.join(salon.id);

    socket.emit("bienvenue", {
      pseudo: nom,
      salons: salons.map((s) => ({ ...s, messages: historique[s.id] })),
    });
    io.emit("connectes", connectes.size);
  });

  // 2) Un message est envoyé dans un salon précis
  socket.on("message", ({ salonId, texte } = {}) => {
    const auteur = connectes.get(socket.id);
    const contenu = String(texte || "").trim().slice(0, 1000);
    if (!auteur || !contenu || !salonExiste(salonId)) return;

    const msg = {
      salonId,
      auteur,
      texte: contenu,
      heure: new Date().toISOString(),
      idAuteur: socket.id,
    };
    historique[salonId].push(msg);
    if (historique[salonId].length > 100) historique[salonId].shift();

    // Seuls les membres de la room reçoivent le message
    io.to(salonId).emit("message", msg);
  });

  // 3) « est en train d'écrire… » dans un salon précis
  socket.on("frappe", ({ salonId, enCours } = {}) => {
    const auteur = connectes.get(socket.id);
    if (!auteur || !salonExiste(salonId)) return;
    socket.to(salonId).emit("frappe", { salonId, auteur, enCours: !!enCours });
  });

  socket.on("disconnect", () => {
    if (connectes.delete(socket.id)) io.emit("connectes", connectes.size);
  });
});

const PORT = process.env.PORT || 3000;
serveur.listen(PORT, () => console.log(`Serveur sur http://localhost:3000`));