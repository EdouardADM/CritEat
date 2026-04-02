#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# download-overture.sh — Télécharge les places Overture Maps pour Bruxelles+30km
#
# Usage (macOS / Linux / WSL) :
#   chmod +x scripts/download-overture.sh
#   ./scripts/download-overture.sh
#
# Windows PowerShell (sans WSL) :
#   Lancer manuellement les commandes ci-dessous dans un terminal Python :
#     pip install overturemaps
#     overturemaps download --bbox=4.10,50.65,4.65,50.98 -f geojson --type=place -o scripts/bruxelles_places.geojson
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

BBOX="4.10,50.65,4.65,50.98"
OUTPUT="scripts/bruxelles_places.geojson"
MIN_PYTHON_MINOR=10

# ─── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}▶  $*${RESET}"; }
success() { echo -e "${GREEN}✓  $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠  $*${RESET}"; }
error()   { echo -e "${RED}✗  $*${RESET}" >&2; exit 1; }

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  CritEat — Téléchargement Overture Maps                ║${RESET}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ─── 1. Vérifier Python 3.10+ ────────────────────────────────────────────────
info "Vérification de Python…"

PYTHON_BIN=""
for cmd in python3 python; do
  if command -v "$cmd" &>/dev/null; then
    VERSION=$("$cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || true)
    MAJOR=$(echo "$VERSION" | cut -d. -f1)
    MINOR=$(echo "$VERSION" | cut -d. -f2)
    if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge "$MIN_PYTHON_MINOR" ]; then
      PYTHON_BIN="$cmd"
      success "Python $VERSION trouvé ($cmd)"
      break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  error "Python 3.${MIN_PYTHON_MINOR}+ requis. Installe-le depuis https://www.python.org/downloads/"
fi

# ─── 2. Installer / vérifier le CLI overturemaps ─────────────────────────────
info "Vérification du CLI overturemaps…"

if ! command -v overturemaps &>/dev/null; then
  warn "CLI overturemaps absent — installation en cours…"
  "$PYTHON_BIN" -m pip install --quiet overturemaps
  success "overturemaps installé"
else
  CURRENT_VERSION=$(overturemaps --version 2>/dev/null || echo "inconnu")
  success "overturemaps déjà installé (v$CURRENT_VERSION)"
fi

# ─── 3. Téléchargement ───────────────────────────────────────────────────────
info "Téléchargement des places Overture pour la zone Bruxelles+30km…"
echo -e "   Bounding box : ${BOLD}${BBOX}${RESET}  (lng_min, lat_min, lng_max, lat_max)"
echo -e "   Sortie       : ${BOLD}${OUTPUT}${RESET}"
echo ""

# Crée le dossier scripts/ si nécessaire
mkdir -p "$(dirname "$OUTPUT")"

# Lance le téléchargement — peut prendre 5-15 minutes selon la connexion
overturemaps download \
  --bbox="${BBOX}" \
  -f geojson \
  --type=place \
  -o "${OUTPUT}"

# ─── 4. Vérification et stats ─────────────────────────────────────────────────
if [ ! -f "$OUTPUT" ]; then
  error "Fichier de sortie absent — le téléchargement a échoué."
fi

# Taille du fichier
FILE_SIZE=$(du -sh "$OUTPUT" | cut -f1)

# Nombre de features (chaque feature est une ligne dans le GeoJSON généré par Overture)
FEATURE_COUNT=$(grep -c '"type":"Feature"' "$OUTPUT" 2>/dev/null || echo "?")

echo ""
success "Téléchargement terminé"
echo -e "   Fichier   : ${OUTPUT}"
echo -e "   Taille    : ${BOLD}${FILE_SIZE}${RESET}"
echo -e "   Features  : ${BOLD}${FEATURE_COUNT}${RESET} lieux"
echo ""
echo -e "${CYAN}Lance maintenant l'import Node.js :${RESET}"
echo -e "  ${BOLD}cd scripts && node import-restaurants.mjs${RESET}"
echo ""
