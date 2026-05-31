const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const ftp = require('basic-ftp');

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups_temp');

let lastBackupStatus = { ftp: null, gdrive: null, time: null, error: null };

function getBackupStatus() { return lastBackupStatus; }

// Cria um ZIP com todos os arquivos .db e .json da pasta data/
function createBackupZip() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const now = new Date();
    const ts = now.toISOString().replace(/[T:]/g, '-').split('.')[0];
    const zipName = `backup_${ts}.zip`;
    const zipPath = path.join(BACKUP_DIR, zipName);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve({ zipPath, zipName, size: archive.pointer() }));
    archive.on('error', reject);
    archive.pipe(output);
    // Adicionar todos os .db e .json da pasta data (exceto backups_temp)
    const files = fs.readdirSync(DATA_DIR).filter(f => 
      (f.endsWith('.db') || f.endsWith('.json')) && f !== 'backups_temp'
    );
    files.forEach(f => archive.file(path.join(DATA_DIR, f), { name: f }));
    archive.finalize();
  });
}

// Upload via FTP
async function uploadToFTP(zipPath, zipName, config) {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: config.ftp_host,
      user: config.ftp_user,
      password: config.ftp_pass,
      secure: false
    });
    const remotePath = config.ftp_path || '/backups';
    await client.ensureDir(remotePath);
    await client.uploadFrom(zipPath, `${remotePath}/${zipName}`);
    console.log(`✅ Backup FTP enviado: ${zipName}`);
    return true;
  } catch (err) {
    console.error(`❌ Erro FTP: ${err.message}`);
    throw err;
  } finally {
    client.close();
  }
}

// Limpar backups antigos no FTP (manter últimos N dias)
async function cleanOldFTP(config, retentionDays = 30) {
  const client = new ftp.Client();
  try {
    await client.access({
      host: config.ftp_host,
      user: config.ftp_user,
      password: config.ftp_pass,
      secure: false
    });
    const remotePath = config.ftp_path || '/backups';
    const list = await client.list(remotePath);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    for (const file of list) {
      if (file.name.startsWith('backup_') && file.name.endsWith('.zip')) {
        // Extrair data do nome: backup_2026-05-27-03-00-00.zip
        const match = file.name.match(/backup_(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          const fileDate = new Date(`${match[1]}-${match[2]}-${match[3]}`);
          if (fileDate < cutoff) {
            await client.remove(`${remotePath}/${file.name}`);
            console.log(`🗑️ FTP: removido backup antigo ${file.name}`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`⚠️ Erro ao limpar FTP: ${err.message}`);
  } finally {
    client.close();
  }
}

// Upload para Google Drive
async function uploadToGDrive(zipPath, zipName, config) {
  try {
    const credentials = JSON.parse(config.google_credentials);
    const { google } = require('googleapis');
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    const drive = google.drive({ version: 'v3', auth });
    
    const fileMetadata = {
      name: zipName,
      parents: config.google_folder_id ? [config.google_folder_id] : []
    };
    const media = {
      mimeType: 'application/zip',
      body: fs.createReadStream(zipPath)
    };
    await drive.files.create({ resource: fileMetadata, media, fields: 'id' });
    console.log(`✅ Backup Google Drive enviado: ${zipName}`);
    
    // Limpar backups antigos no Drive (manter últimos 30 dias)
    if (config.google_folder_id) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const listRes = await drive.files.list({
        q: `'${config.google_folder_id}' in parents and name contains 'backup_' and trashed=false`,
        fields: 'files(id,name,createdTime)',
        orderBy: 'createdTime asc'
      });
      for (const f of (listRes.data.files || [])) {
        if (new Date(f.createdTime) < cutoff) {
          await drive.files.delete({ fileId: f.id });
          console.log(`🗑️ GDrive: removido backup antigo ${f.name}`);
        }
      }
    }
    return true;
  } catch (err) {
    console.error(`❌ Erro Google Drive: ${err.message}`);
    throw err;
  }
}

// Orquestrador principal
async function runBackup(getConfigFn) {
  console.log(`\n🔄 Iniciando backup... ${new Date().toLocaleString('pt-BR')}`);
  const status = { ftp: null, gdrive: null, time: new Date().toISOString(), error: null };
  
  try {
    // Criar ZIP
    const { zipPath, zipName, size } = await createBackupZip();
    console.log(`📦 ZIP criado: ${zipName} (${(size / 1024).toFixed(1)} KB)`);
    
    // Buscar config do banco
    const config = getConfigFn ? getConfigFn() : {};
    
    // FTP
    if (config.ftp_host && config.ftp_user && config.ftp_pass) {
      try {
        await uploadToFTP(zipPath, zipName, config);
        await cleanOldFTP(config, 30);
        status.ftp = 'ok';
      } catch (e) {
        status.ftp = 'erro';
        status.error = (status.error || '') + 'FTP: ' + e.message + '; ';
      }
    } else {
      status.ftp = 'não configurado';
      console.log('⚠️ FTP não configurado, pulando...');
    }
    
    // Google Drive
    if (config.google_credentials && config.google_folder_id) {
      try {
        await uploadToGDrive(zipPath, zipName, config);
        status.gdrive = 'ok';
      } catch (e) {
        status.gdrive = 'erro';
        status.error = (status.error || '') + 'GDrive: ' + e.message + '; ';
      }
    } else {
      status.gdrive = 'não configurado';
      console.log('⚠️ Google Drive não configurado, pulando...');
    }
    
    // Limpar ZIP temporário
    try { fs.unlinkSync(zipPath); } catch (e) {}
    
  } catch (err) {
    status.error = err.message;
    console.error(`❌ Erro geral no backup: ${err.message}`);
  }
  
  lastBackupStatus = status;
  console.log(`✅ Backup finalizado: FTP=${status.ftp}, GDrive=${status.gdrive}\n`);
  return status;
}

module.exports = { runBackup, getBackupStatus };
