# Piano Integrazione Electron (Windows Build)

Questo documento elenca i passaggi necessari per convertire questo progetto Next.js (con server custom Socket.io) in un'applicazione desktop Windows `.exe` tramite Electron e `electron-builder`.

## 1. Installazione Dipendenze
Per gestire Electron durante lo sviluppo e per compilare l'app in produzione:
```bash
npm install --save-dev electron electron-builder concurrently cross-env wait-on
```

## 2. Creare il file di ingresso `main.js`
Creare un file `main.js` nella root del progetto. Questo file sarà il cuore dell'app Electron.
- In **produzione** (app pacchettizzata), `main.js` dovrà avviare direttamente il server Next.js (richiamando `server.js` programmabilmente su una porta casuale o fissa) e, una volta in ascolto, avviare un `BrowserWindow` di Electron nascondendo i bordi del browser.
- In **sviluppo**, può limitarsi a caricare `http://localhost:3000` (dopo che il server Next è partito via linea di comando).

## 3. Ottimizzare Next.js per l'App Desktop
Next.js in produzione usa la cartella `.next`. Per Electron, l'app completa deve essere pacchettizzata in un eseguibile senza richiedere che l'utente installi Node.js.
- Aprire `next.config.ts` e impostare `output: 'standalone'` se possibile, per minimizzare i `node_modules` necessari. In alternativa, se non si usa 'standalone', bisognerà spostare le dipendenze essenziali del server (Next, React, Socket.io) in `dependencies` (e rimuovere tutto ciò che è solo per sviluppo) affinché `electron-builder` le includa.

## 4. Aggiornare il `package.json`
Modificare il file configurando l'avvio e la compilazione:
1.  Impostare il file di entry point:
    ```json
    "main": "main.js",
    ```
2.  Aggiungere gli script di sviluppo e build:
    ```json
    "scripts": {
      "dev": "node server.js",
      "build": "next build",
      "electron:dev": "cross-env NODE_ENV=development concurrently \"npm run dev\" \"wait-on http://localhost:3000 && electron .\"",
      "electron:build": "npm run build && electron-builder --win"
    }
    ```
3.  Aggiungere la configurazione di `electron-builder`:
    ```json
    "build": {
      "appId": "com.mkvocal.desktop",
      "productName": "MK Vocal",
      "directories": {
        "output": "dist-electron"
      },
      "files": [
        ".next/**/*",
        "public/**/*",
        "server.js",
        "main.js",
        "package.json"
      ],
      "win": {
        "target": "nsis"
      }
    }
    ```

## 5. Problematiche e Considerazioni sul Server Socket.io
Dato che l'app utilizza Socket.io internamente e si aspetta connessioni multiple (è un'app "Voce" in rete locale/internet?), l'aggiunta di Electron serve tipicamente a creare un *client PC*.
Se ogni `.exe` ha un suo `server.js` attivo internamente, gli utenti non si connetteranno tutti allo stesso meeting room ma al "proprio server locale" invisibile.
**Attenzione:** Occorre decidere se l'app Electron deve funzionare solo come *Client* (che si connette al tuo server `server.js` hostato sul cloud, in questo caso in Electron si fa semplicemente `win.loadURL('url_del_tuo_sito')`) o come *Server Locale P2P*, in cui un utente apre l'app (che avvia il server) e gli altri si connettono tramite IP locale.

Se sei d'accordo con questo piano, possiamo avviare l'esecuzione dei comandi!
