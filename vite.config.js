import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    base: '/item-based/', // GitHub Pages 배포를 위한 기본 경로 설정
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                teacher: resolve(__dirname, 'teacher.html'),
                login: resolve(__dirname, 'login.html')
            }
        }
    }
});
