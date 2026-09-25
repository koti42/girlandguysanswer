// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RequireRole from './RequireRole';

const state = { user: null, booting: false, panels: [] };
vi.mock('./PanelAuthContext', () => ({ usePanelAuth: () => state }));

function app(initial) {
    return render(
        <MemoryRouter initialEntries={[initial]}>
            <Routes>
                <Route path="/mod/login" element={<div>MOD LOGIN</div>} />
                <Route path="/cpl-manage/login" element={<div>ADMIN LOGIN</div>} />
                <Route path="/cpl-manage" element={<div>ADMIN HOME</div>} />
                <Route path="/mod" element={<RequireRole panel="mod" loginPath="/mod/login"><div>MOD HOME</div></RequireRole>} />
                <Route path="/cpl-manage/users" element={<RequireRole panel="admin" loginPath="/cpl-manage/login"><div>ADMIN USERS</div></RequireRole>} />
            </Routes>
        </MemoryRouter>
    );
}

describe('RequireRole', () => {
    beforeEach(() => { state.user = null; state.booting = false; state.panels = []; });

    it('girişsiz kullanıcıyı login\'e yollar', () => {
        app('/mod');
        expect(screen.getByText('MOD LOGIN')).toBeInTheDocument();
    });

    it('yükleniyorken dönen gösterge, içerik yok', () => {
        state.booting = true;
        app('/mod');
        expect(screen.queryByText('MOD HOME')).toBeNull();
    });

    it('moderatör mod paneline girer', () => {
        state.user = { id: 'm' }; state.panels = ['mod'];
        app('/mod');
        expect(screen.getByText('MOD HOME')).toBeInTheDocument();
    });

    it('moderatör admin sayfasına gidince mod paneline düşer, login\'e değil', () => {
        state.user = { id: 'm' }; state.panels = ['mod'];
        app('/cpl-manage/users');
        expect(screen.getByText('MOD HOME')).toBeInTheDocument();
    });

    it('admin her iki panele girer', () => {
        state.user = { id: 'a' }; state.panels = ['mod', 'admin'];
        app('/cpl-manage/users');
        expect(screen.getByText('ADMIN USERS')).toBeInTheDocument();
    });
});
