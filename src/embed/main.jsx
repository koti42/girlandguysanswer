import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import '../components/game/game.css';
import './embed.css';
import { installChunkReloadHandler } from '../components/game/chunkReload';
import { installNativeReceiver } from './bridge';
import EmbedApp from './EmbedApp';

/*
 * Mobil uygulama için gömülü oyun girişi (embed.html, şartname v2 §D.1).
 * Ayrı React kökü: sitenin App kabuğu, AuthContext ve reklamları yüklenmez.
 * Köprü alıcısı React'ten önce kurulur: native'in erken gönderdiği mesajlar
 * (ör. pause) kuyrukta bekler.
 */
installNativeReceiver();
installChunkReloadHandler();

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <EmbedApp />
    </StrictMode>
);
