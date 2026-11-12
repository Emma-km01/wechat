const socket = io();

// ---------- Éléments de la page ----------
const ecranConnexion = document.getElementById("ecranConnexion");
const appli = document.getElementById("appli");
const formConnexion = document.getElementById("formConnexion");
const champPseudo = document.getElementById("champPseudo");
const monPseudo = document.getElementById("monPseudo");
const listeDiscussions = document.getElementById("listeDiscussions");
const conversationVide = document.getElementById("conversationVide");
const conversation = document.getElementById("conversation");
const boutonRetour = document.getElementById("boutonRetour");
const titreConversation = document.getElementById("titreConversation");
const sousTitre = document.getElementById("sousTitre");
const listeMessages = document.getElementById("listeMessages");
const indicateurFrappe = document.getElementById("indicateurFrappe");
const formMessage = document.getElementById("formMessage");
const champMessage = document.getElementById("champMessage");

// ---------- État de l'application ----------
const etat = {
  salons: [],      // [{ id, nom }]
  messages: {},    // id du salon -> liste de messages
  nonLus: {},      // id du salon -> nombre de messages non lus
  actif: null,     // id du salon ouvert (null = aucun)
  frappe: {},      // id du salon -> Set des personnes qui écrivent
  nbConnectes: 0,
};

const formaterHeure = (iso) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// ---------- Connexion ----------
formConnexion.addEventListener("submit", (e) => {
  e.preventDefault();
  socket.emit("rejoindre", champPseudo.value);
});

socket.on("bienvenue", ({ pseudo, salons }) => {
  monPseudo.textContent = pseudo;
  for (const salon of salons) {
    etat.salons.push({ id: salon.id, nom: salon.nom });
    etat.messages[salon.id] = salon.messages;
    etat.nonLus[salon.id] = 0;
    etat.frappe[salon.id] = new Set();
  }
  ecranConnexion.classList.add("cache");
  appli.classList.remove("cache");
  afficherListe();
});

socket.on("connectes", (nombre) => {
  etat.nbConnectes = nombre;
  if (etat.actif) sousTitre.textContent = `${nombre} connecté(s)`;
});

// ---------- Liste des discussions (panneau de gauche) ----------
function afficherListe() {
  listeDiscussions.replaceChildren();

  for (const salon of etat.salons) {
    const msgs = etat.messages[salon.id];
    const dernier = msgs[msgs.length - 1];

    const li = document.createElement("li");
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "discussion" + (salon.id === etat.actif ? " discussion-active" : "");
    bouton.addEventListener("click", () => ouvrir(salon.id));

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = salon.nom[0].toUpperCase();

    const texte = document.createElement("div");
    texte.className = "discussion-texte";

    const haut = document.createElement("div");
    haut.className = "discussion-haut";
    const nom = document.createElement("span");
    nom.className = "discussion-nom";
    nom.textContent = salon.nom;
    const heure = document.createElement("span");
    heure.className = "discussion-heure";
    heure.textContent = dernier ? formaterHeure(dernier.heure) : "";
    haut.append(nom, heure);

    const bas = document.createElement("div");
    bas.className = "discussion-bas";
    const apercu = document.createElement("span");
    apercu.className = "discussion-apercu";
    apercu.textContent = dernier ? `${dernier.auteur} : ${dernier.texte}` : "Aucun message";
    bas.appendChild(apercu);

    if (etat.nonLus[salon.id] > 0) {
      const pastille = document.createElement("span");
      pastille.className = "pastille";
      pastille.textContent = etat.nonLus[salon.id];
      bas.appendChild(pastille);
    }

    texte.append(haut, bas);
    bouton.append(avatar, texte);
    li.appendChild(bouton);
    listeDiscussions.appendChild(li);
  }
}

// ---------- Ouvrir / fermer une discussion ----------
function ouvrir(salonId) {
  const salon = etat.salons.find((s) => s.id === salonId);
  etat.actif = salonId;
  etat.nonLus[salonId] = 0;

  titreConversation.textContent = salon.nom;
  sousTitre.textContent = `${etat.nbConnectes} connecté(s)`;
  conversationVide.classList.add("cache");
  conversation.classList.remove("cache");
  appli.classList.add("conversation-ouverte");

  listeMessages.replaceChildren();
  for (const msg of etat.messages[salonId]) listeMessages.appendChild(creerMessage(msg));
  descendre();

  afficherIndicateur();
  afficherListe();
  champMessage.focus();
}

boutonRetour.addEventListener("click", () => {
  etat.actif = null;
  conversation.classList.add("cache");
  conversationVide.classList.remove("cache");
  appli.classList.remove("conversation-ouverte");
  afficherListe();
});

// ---------- Messages ----------
function creerMessage(msg) {
  const estMoi = msg.idAuteur === socket.id;

  const li = document.createElement("li");
  li.className = `message ${estMoi ? "message-moi" : "message-autre"}`;

  if (!estMoi) {
    const nom = document.createElement("span");
    nom.className = "nom-auteur";
    nom.textContent = msg.auteur;
    li.appendChild(nom);
  }

  const bulle = document.createElement("div");
  bulle.className = `bulle ${estMoi ? "bulle-moi" : "bulle-autre"}`;
  bulle.textContent = msg.texte; // textContent : pas d'injection de HTML
  li.appendChild(bulle);

  const heure = document.createElement("span");
  heure.className = "heure";
  heure.textContent = formaterHeure(msg.heure);
  li.appendChild(heure);

  return li;
}

function descendre() {
  listeMessages.scrollTop = listeMessages.scrollHeight;
}

formMessage.addEventListener("submit", (e) => {
  e.preventDefault();
  const texte = champMessage.value.trim();
  if (!texte || !etat.actif) return;
  socket.emit("message", { salonId: etat.actif, texte });
  socket.emit("frappe", { salonId: etat.actif, enCours: false });
  champMessage.value = "";
});

socket.on("message", (msg) => {
  etat.messages[msg.salonId].push(msg);

  if (msg.salonId === etat.actif) {
    listeMessages.appendChild(creerMessage(msg));
    descendre();
  } else if (msg.idAuteur !== socket.id) {
    etat.nonLus[msg.salonId]++;
  }
  afficherListe();
});

// ---------- « est en train d'écrire… » ----------
let minuteurFrappe;
champMessage.addEventListener("input", () => {
  if (!etat.actif) return;
  const salonId = etat.actif;
  socket.emit("frappe", { salonId, enCours: true });
  clearTimeout(minuteurFrappe);
  minuteurFrappe = setTimeout(() => socket.emit("frappe", { salonId, enCours: false }), 1500);
});

socket.on("frappe", ({ salonId, auteur, enCours }) => {
  enCours ? etat.frappe[salonId].add(auteur) : etat.frappe[salonId].delete(auteur);
  if (salonId === etat.actif) afficherIndicateur();
});

function afficherIndicateur() {
  const noms = etat.actif ? [...etat.frappe[etat.actif]] : [];
  indicateurFrappe.textContent = noms.length ? `${noms.join(", ")} écrit…` : "";
}