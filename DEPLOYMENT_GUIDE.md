# T.R.A.S.H. - Barangay 40 & 41, Cavite City
## Opisyal na Gabay sa Pag-deploy at Pag-host

Ang proyektong ito ay buong-buo at nakadisenyo para sa **Barangay 40 at Barangay 41, Cavite City**. Mayroon itong:
1. **Kagawad Requirement ng Proeba:** Bago ma-resolve ang ticket, kinakailangang mag-attach ng litrato ng nilinis na lugar na babalik sa residente bilang katibayan.
2. **Raspberry Pi 4 Cloud Storage Transit:** Lahat ng litrato (ulat at proeba) at logbook ay permanenteng nai-store sa database disk.
3. **Residente Phone Storage:** Ang bawat residente ay may sariling imbakan sa kanilang cellphone kung saan pwede nilang idelete o panatilihin ang kanilang tala.
4. **Telegram Bot Dispatcher:** Awtomatikong nagpapadala ng alert sa bawat bagong concern at bawat natapos na koleksyon, kasama ang updated na listahan ng mga hindi pa natatapos na concern.

### OPSYON 1: Libreng Cloud Hosting via Render.com (Inirerekomenda)
1. Mag-sign up o mag-log in sa [Render.com](https://render.com).
2. Pindutin ang **"New +"** -> **"Web Service"**.
3. Ikonekta ang iyong GitHub account at piliin ang repository.
4. Settings:
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

### OPSYON 2: Lokal na Server sa Barangay Hall Gamit ang Raspberry Pi 4
1. I-kopya ang source code sa Raspberry Pi 4.
2. Buksan ang Terminal at mag-navigate:
   ```bash
   cd ~/trash-barangay40-41
   npm install
   npm run build
   sudo npm install -g pm2
   pm2 start "npm start" --name "trash-brgy40-41"
   pm2 save
   pm2 startup
   ```

### Default Credentials para sa Kagawad Portal:
- **Username:** `kagawad41` o `kagawad40` o `admin`
- **Password:** `Kagawad@Cavite2026#Brgy41!` (Maaaring palitan anumang oras gamit ang "Palitan Password")
