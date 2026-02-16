import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 七权主题色
        'soyorin': '#884499',
        'mike': '#7777AA',
        'qa': '#66BB66',
        'engineer': '#FFDD88',
        'pm': '#884499',
        'arch': '#EE6677',
      },
    },
  },
  plugins: [],
};

export default config;
