import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                teacher: resolve(__dirname, 'teacher.html'),
                login: resolve(__dirname, 'login.html')
            }
        }
    }
});
