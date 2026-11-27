# Planet IH

Planet IH is a browser multiplayer prototype for [Isekai Hell](https://github.com/Almatter/IsekaiHell). Up to eight players can meet in a medieval fantasy tea house. Open **Customize avatar** before hosting or joining. The three bodies have their own four-direction walk cycles. The medium body is the furniture reference, with small at half scale and large at 1.5×. Your avatar choices and display name are saved in your browser. Click or tap the floor to move. WASD and arrow keys also work.

Avatars use painted anime-style layers. Outfit dye, skin, eyes, hair, ears, horns, tails, wings, and lips have separate color controls. The preview shows your choices from the front, left, right, and back.

## Align avatar artwork

Open **Customize avatar → Open alignment editor** or visit `avatar-studio.html`. Choose a view, pose, and test outfit. Select a part in **Layers**, then drag it, nudge it with the arrow keys, or enter the offsets. A higher draw order places a part in front. Adjustments can apply across all versions of a part in that view, to matching artwork or outfit, or to a specific body size as well.

The editor saves a draft in your browser. **Export layout** downloads `avatar-layout.json`. Replace the file in the repository root, commit it, and push it to the publishing branch. The game and its customizer both load that layout. The editor can also import the file to continue work on a draft.

For hair that straddles the face, unhide **Rear hair** to position a copy behind the head. Use the clip fields to trim the front **Hair** layer to the fringe you want to keep.

**Flip horizontally** inverts a layer in the chosen view. For side views, **Side eyes** offers two open-eye looks or a near-eye-only look. The near eye and far eye can be aligned independently.

## Join a room

1. On the game page, enter a display name and choose **Host room**, then **Create invite**.
2. Send the invite link or code privately to one friend. They open the link in their browser, or open Planet IH and paste the code under **Join room**, then choose a name and avatar before selecting **Generate reply**.
3. Have them send the reply code back. Paste it into the host page and choose **Connect guest**.
4. Create a fresh invite for each additional friend. Keep the host tab open for the life of the room. On a phone, the join controls appear above the field. Open the invite in Safari or Chrome and return to the game after sending the reply. Planet IH has no countdown for swapping codes, though mobile browsers can still suspend or discard a tab left in the background.

Use **Copy Discord invite code** to send a code block that your friend can paste into **Join room** in their browser. **Copy Discord reply** also formats the reply as a code block. Both fields accept the code by itself or with the surrounding backticks. If a link opens inside Discord or another app, select **Copy invite for browser** and paste it into your usual browser’s address bar before generating a reply.

On phones with a share sheet, use **Share reply** and choose the chat app if it appears. If the browser reloads the game, Planet IH restores the invite in the same tab. Generate a replacement reply if the host hasn’t entered the old one. Otherwise, the host can cancel that connection and create a new invite without closing the room.

Room chat allows up to 100 characters per message. New messages appear in speech bubbles beside players for a few seconds. The fixed-height history scrolls, is available to later arrivals, and clears when the room closes. The host can **Mute** a guest for a specified duration or **Kick** them. A muted guest can keep playing and reading chat, and can see how long remains on their mute.

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
