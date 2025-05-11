// import './style.css'; // Basic styles, if any -- Removed as src/style.css was deleted
import { App } from '@/App';

const canvas = document.getElementById(
  'app-canvas'
) as HTMLCanvasElement | null;

if (!canvas) {
  console.error('Canvas element #app-canvas not found!');
} else {
  const app = new App(canvas);
  app.start();

  // Optional: handle hot module replacement for dispose
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      app.dispose();
    });
  }
}
