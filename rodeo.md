# VirtualTabletop — Nuovo componente (Owlbear Rodeo–style)

Creare un **nuovo componente** `VirtualTabletop.tsx` ispirato a [Owlbear Rodeo](https://www.owlbear.rodeo/), separato dal componente `Whiteboard.tsx` esistente (che rimane invariato). Mantiene la sincronizzazione in tempo reale via Socket.IO.

## Riferimento: componente Whiteboard esistente

Il componente `Whiteboard.tsx` (423 righe) **non verrà toccato**. Rimane disponibile come lavagna collaborativa semplice. Il nuovo `VirtualTabletop.tsx` sarà un componente indipendente con i propri eventi socket dedicati.

---

> [!IMPORTANT]
> Il piano è diviso in **4 fasi incrementali**. Ogni fase è autocontenuta e funzionante. Si consiglia di procedere fase per fase, verificando prima di passare alla successiva.

> [!WARNING]
> Tutte le fasi richiedono **nuovi eventi socket** con prefisso `vtt-*` per non interferire con quelli della Whiteboard esistente (`whiteboard-*`).

---

## Proposed Changes

### Fase 1 — Pan/Zoom, Strumenti di disegno avanzati, Undo/Redo

Questa è la base fondamentale del virtual tabletop.

#### [NEW] `src/components/VirtualTabletop.tsx`

Nuovo componente React con canvas HTML5 e le seguenti funzionalità:

**Pan & Zoom (navigazione della mappa)**
- Stato `camera: { x, y, zoom }` per gestire la vista
- **Rotellina mouse** → zoom in/out (range `0.25×` – `4×`)
- **Click destro trascinato** oppure **middle-click** → pan della vista
- **Pinch-to-zoom** su touch
- Applicare `ctx.setTransform()` prima del rendering per tradurre/scalare tutto il canvas
- Funzione `getPos()` che compensa camera offset e zoom

**Strumenti di disegno (Drawing + Shapes)**
- Tool: `'pencil' | 'eraser' | 'line' | 'rect' | 'circle' | 'arrow'`
- Palette colori (6+ colori) e slider per spessore tratto
- Preview in tempo reale durante il trascinamento (rubber-band) per le forme
- Le forme vengono salvate come `Path` con tipo e punti `start/end`

**Immagine di sfondo**
- Upload, sincronizzazione e rimozione (come la whiteboard esistente, ma con eventi `vtt-*`)

**Undo / Redo**
- Stack locale `undoStack` / `redoStack` di tipo `Path[]`
- `Ctrl+Z` → undo, `Ctrl+Shift+Z` → redo
- Bottoni dedicati nella toolbar
- Emissione socket per sincronizzare rimozione/reinserimento tracce

**Toolbar**
- Raggruppata in sezioni: Navigazione | Disegno | Forme | Colori | Azioni
- Download PNG e invio in chat
- Icone per ogni strumento

#### [MODIFY] `src/components/VoiceRoom.tsx`
- Aggiungere un toggle/bottone nella control bar per aprire il VirtualTabletop (separato dalla Whiteboard)
- Import del nuovo componente `VirtualTabletop`
- Stato `showVTT` per gestire la visibilità

#### [MODIFY] `server.js`
- Nuovi eventi con prefisso `vtt-`: `vtt-draw`, `vtt-clear`, `vtt-history`, `vtt-bg`, `vtt-clear-bg`, `vtt-undo`, `vtt-redo`
- Storage server-side `roomVTT[roomId]` separato da `roomWhiteboards`

#### [MODIFY] `src/i18n/it.json` / `src/i18n/en.json`
- Aggiungere sezione `virtual_tabletop` con chiavi i18n: `line`, `rectangle`, `circle`, `arrow`, `undo`, `redo`, `pan_mode`, `open_vtt`, `close_vtt`, ecc.

---

### Fase 2 — Griglia + Strumento Misurazione

#### [MODIFY] `src/components/VirtualTabletop.tsx`

**Griglia overlay**
- Stato `grid: { enabled, cellSize, type: 'square' | 'hex', color, opacity }`
- Rendering della griglia come overlay semi-trasparente sopra lo sfondo ma sotto i disegni
- La griglia segue la camera (pan/zoom)
- Dropdown nella toolbar per tipo griglia (nessuna / quadrata / esagonale)
- Input numerico per dimensione cella (in px)
- **Snap-to-grid** opzionale per il disegno di forme

**Strumento misurazione**
- Nuovo tool `'measure'` che disegna una linea temporanea con label della distanza (in celle)
- Visualizzazione della distanza in tempo reale durante il drag
- Non persiste sul canvas dopo il rilascio del mouse

---

### Fase 3 — Token e Props draggabili

#### [MODIFY] `src/components/VirtualTabletop.tsx`

**Token system**
- Nuovo tipo `Token { id, x, y, width, height, imageUrl, label, layer: 'token' | 'prop', lockedBy? }`
- Stato `tokens: Token[]`
- Nuovo tool `'select'` per selezionare e trascinare token/props
- Click diretto su un token → selezionato (bordo evidenziato)
- Drag → sposta il token (con snap-to-grid se attivo)
- Context menu (tasto destro) su token: rinomina, ridimensiona, rimuovi, porta sopra/sotto
- **Upload token**: bottone nella toolbar per caricare un'immagine come token
- Token circolari di default, props rettangolari

**Sincronizzazione**
- I token vengono sincronizzati in tempo reale via nuovi eventi socket

#### [MODIFY] `server.js`
- Nuovi eventi: `vtt-token-add`, `vtt-token-move`, `vtt-token-remove`, `vtt-token-update`
- Storage server-side `roomTokens[roomId]` per la persistenza dei token

#### [MODIFY] i18n files
- Chiavi per: `token`, `add_token`, `remove_token`, `rename_token`, `props`, `select_tool`, ecc.

---

### Fase 4 — Fog of War

#### [MODIFY] `src/components/VirtualTabletop.tsx`

**Fog of War (solo GM)**
- Nuovo tool `'fog'` che permette di disegnare aree rivelate/nascoste
- Layer `fog` nero semi-trasparente sopra tutto
- Click+drag per rivelare rettangoli (toggle reveal/hide)
- I giocatori vedono il fog, solo il GM lo può modificare
- Concetto di **ruolo GM**: il primo utente della stanza, oppure un toggle nella UI

#### [MODIFY] `server.js`
- Nuovi eventi: `vtt-fog-update`, `vtt-fog-history`
- Storage `roomFog[roomId]` per le zone rivelate

---

## Verification Plan

### Manual Verification (Fase 1)

1. **Pan/Zoom**: Aprire il VTT, usare la rotellina per zoomare, click destro + drag per muovere la vista. Il disegno deve rimanere nella posizione corretta.
2. **Forme**: Selezionare lo strumento rettangolo, disegnare un rettangolo. Verificare preview durante il drag e sincronizzazione con un altro utente.
3. **Undo/Redo**: Disegnare 3 tratti, premere Ctrl+Z 2 volte → rimane solo il primo. Ctrl+Shift+Z → ritorna il secondo.
4. **Whiteboard invariata**: Verificare che la Whiteboard esistente continui a funzionare normalmente.

### Manual Verification (Fase 2)

1. **Griglia**: Attivare la griglia quadrata, verificare che segua zoom/pan. Cambiare tipo a esagonale.
2. **Misurazione**: Selezionare il tool misura, trascinare sulla griglia. La label con il numero di celle deve aggiornarsi in tempo reale.

### Manual Verification (Fasi 3 e 4)

1. **Token**: Caricare un'immagine come token, trascinarlo sulla mappa. Un secondo utente deve vederlo in tempo reale.
2. **Fog of War**: Attivare il fog, rivelare un'area. Un player deve vedere l'area rivelata e il resto coperto.

> [!TIP]
> Per testare la sincronizzazione, aprire due tab del browser nella stessa stanza con utenti diversi.
