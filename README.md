# Planet IH

Planet IH is a browser multiplayer prototype for [Isekai Hell](https://github.com/Almatter/IsekaiHell). Up to eight players can meet in a medieval fantasy tea house. Each player gets a distinct name and block color. Click or tap the floor to move. WASD and arrow keys also work.

## Join a room

1. On the game page, enter a display name and choose **Host room**, then **Create invite**.
2. Send the invite link privately to one friend. They open it in their browser, enter a name, and select **Generate reply**.
3. Have them send the reply code back. Paste it into the host page and choose **Connect guest**.
4. Create a fresh invite for each additional friend. Keep the host tab open for the life of the room. On a phone, the join controls appear above the field. Open the invite in Safari or Chrome and return to the game after sending the reply. Planet IH has no countdown for swapping codes, though mobile browsers can still suspend or discard a tab left in the background.

For Discord, use **Copy Discord invite** to paste a clickable **Join Planet IH** link with the code hidden in the URL. **Copy Discord reply** formats the reply as a code block. The host can paste the code by itself or copy and paste the whole Discord message.

Room chat allows up to 100 characters per message. New messages appear in speech bubbles beside players for a few seconds. Room history is kept in the host's browser, appears for later arrivals, and clears when the room closes. The host can use **Kick** next to a player to remove them while the room stays open.

The host chooses the shared room background and music. Each player controls **Play music** and **Chat sound** for their own browser. New messages you miss show an unread count, which you can tap to jump to chat.

## Run locally

From this folder, start a static HTTP server and open [the local game](http://localhost:8000/). Two or three tabs on the same computer can test the invite flow. For a phone or another device, use the published HTTPS URL so both devices can open the same page.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

## Publish on GitHub Pages

Push the files to a public `Almatter/planet-ih` repository. In **Settings → Pages**, select **Deploy from a branch**, then select the default branch and `/(root)`. The planned project URL is `https://almatter.github.io/planet-ih/`. The app uses relative asset paths and has no build step. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Network limits

The invite and reply carry WebRTC setup data, which can include network addresses. Share them only with the intended player. After the exchange, each guest connects directly to the host’s browser, which distributes the room’s positions. The prototype uses Google’s public STUN endpoint to help find a direct route. Some cellular networks, VPNs, and firewalls require a TURN relay, which is outside this prototype. If a connection fails, try both devices on the same Wi-Fi and generate a fresh invite. [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections)
