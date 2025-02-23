import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// v1.1: Updated alias configuration
// Optimization notes: This change adds an alias mapping "@" to the "src" directory,
// enabling simplified and consistent import paths throughout the project.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
})


