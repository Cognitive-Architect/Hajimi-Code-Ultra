/**
 * 错误码人格化映射 - MyGO!!!!! 梗彩蛋系统
 * B-03/09 彩蛋工程师任务
 * 
 * 将HTTP错误码映射为MyGO!!!!!角色台词与梗
 * 让每个错误页面都有独特的角色个性
 */

export interface ErrorPersona {
  /** 角色ID */
  character: string;
  /** 角色代表色 */
  color: string;
  /** 错误标题（角色经典台词） */
  title: string;
  /** 错误信息（角色风格描述） */
  message: string;
  /** 角色图标/emoji */
  icon: string;
  /** 角色英文/日文名 */
  name: string;
  /** 可选：副台词 */
  subtitle?: string;
}

/**
 * HTTP错误码人格化映射表
 * 
 * 角色对应：
 * - soyorin/soyo: 长崎素世 - 客服小祥梗
 * - taki: 椎名立希 - 压力怪
 * - saki: 丰川祥子 - 背负人生
 * - kaname: 要乐奈 - 猫猫/机油梗
 * - tomori: 高松灯 - 诗人
 * - anon: 千早爱音 - 爱音酱
 * - rana: 乐奈别名
 */
export const ERROR_PERSONA_MAP: Record<number, ErrorPersona> = {
  // ===== 客户端错误 (4xx) =====
  
  400: {
    character: 'anon',
    color: '#FF6699',
    title: '诶？这不对吧？',
    message: '请求格式好像有问题呢...让我再检查一下～',
    icon: '✨',
    name: 'Anon Tokyo',
    subtitle: '愛音ちゃんだよ〜',
  },
  
  401: {
    character: 'saki',
    color: '#6699DD',
    title: '你这个人，满脑子只想着自己呢',
    message: '没有权限的话，我无法让你通过。',
    icon: '❄️',
    name: 'Saki',
    subtitle: 'さきちゃん',
  },
  
  403: {
    character: 'saki',
    color: '#4477BB',
    title: '这是必要的代价',
    message: '这个区域禁止入内。请不要让我为难。',
    icon: '🎹',
    name: 'Oblivionis',
    subtitle: '豊川祥子',
  },
  
  404: {
    character: 'soyorin',
    color: '#884499',
    title: 'なんで春日影やったの！？',
    message: '页面像CRYCHIC一样消失了...你看到了吗？那个页面。',
    icon: '🎸',
    name: 'Soyorin',
    subtitle: '長崎そよ',
  },
  
  405: {
    character: 'taki',
    color: '#555588',
    title: '方法不对',
    message: '这个方法不被允许。认真点啊。',
    icon: '🥁',
    name: 'Taki',
    subtitle: 'たきちゃん',
  },
  
  408: {
    character: 'tomori',
    color: '#77AABB',
    title: '时间...被遗忘了',
    message: '请求超时了，就像那些被遗忘的诗句...',
    icon: '📝',
    name: 'Tomori',
    subtitle: '灯ちゃん',
  },
  
  409: {
    character: 'soyorin',
    color: '#9966AA',
    title: '冲突...就像我们的关系',
    message: '资源冲突了。明明说好要组一辈子乐队的...',
    icon: '🎻',
    name: 'Soyo',
    subtitle: 'そよ',
  },
  
  410: {
    character: 'saki',
    color: '#5588CC',
    title: '已经...不存在了',
    message: '这个资源永久消失了，就像CRYCHIC一样。',
    icon: '💔',
    name: 'Saki',
    subtitle: 'さき',
  },
  
  418: {
    character: 'kaname',
    color: '#FFDD00',
    title: '我是茶壶...喵',
    message: '服务器是个茶壶，正在泡抹茶。',
    icon: '🍵',
    name: 'Rāna',
    subtitle: '要楽奈',
  },
  
  422: {
    character: 'anon',
    color: '#FF88AA',
    title: '无法处理呢～',
    message: '语义错误！但是没关系，下次会成功的！',
    icon: '💅',
    name: 'Anon',
    subtitle: 'あのちゃん',
  },
  
  429: {
    character: 'taki',
    color: '#444477',
    title: '太慢了！',
    message: '请求太多！你就不能快点吗？',
    icon: '⚡',
    name: 'Taki Shiina',
    subtitle: '椎名立希',
  },
  
  // ===== 服务端错误 (5xx) =====
  
  500: {
    character: 'taki',
    color: '#7777AA',
    title: 'つまらない',
    message: '系统崩溃了，就像我的耐心一样。赶紧修好它。',
    icon: '🥁',
    name: 'Taki',
    subtitle: 'たき',
  },
  
  501: {
    character: 'taki',
    color: '#666699',
    title: '还没实现',
    message: '这个功能还没做...你在期待什么？',
    icon: '🎵',
    name: 'Taki',
    subtitle: 'りっきー',
  },
  
  502: {
    character: 'soyorin',
    color: '#775588',
    title: '网关错误...是祥子的错吗？',
    message: '上游服务器无响应。小祥，是你吗...？',
    icon: '🌙',
    name: 'Soyorin',
    subtitle: 'そよりん',
  },
  
  503: {
    character: 'kaname',
    color: '#FFDD00',
    title: '机油...需要休息...',
    message: '服务睡着了，不是故障哦～zzz...',
    icon: '💤',
    name: 'Kaname',
    subtitle: 'かなめ',
  },
  
  504: {
    character: 'tomori',
    color: '#669999',
    title: '等待...永恒地等待',
    message: '网关超时了。时间在这里失去了意义...',
    icon: '🌸',
    name: 'Tomori',
    subtitle: 'ともり',
  },
  
  507: {
    character: 'anon',
    color: '#FF99BB',
    title: '空间不够了～',
    message: '存储空间不足！我的化妆品都没地方放了！',
    icon: '👜',
    name: 'Anon-chan',
    subtitle: '愛音',
  },
};

/**
 * 默认错误人格
 * 当错误码没有对应配置时使用
 */
export const DEFAULT_ERROR_PERSONA: ErrorPersona = {
  character: 'mygo',
  color: '#DD6699',
  title: '迷子でもいい、迷子でも進め',
  message: '虽然是迷子，但还是要前进。未知的错误发生了...',
  icon: '🎤',
  name: 'MyGO!!!!!',
  subtitle: 'まいご',
};

/**
 * 获取错误人格配置
 * @param statusCode HTTP状态码
 * @returns 对应的ErrorPersona配置
 */
export function getErrorPersona(statusCode: number): ErrorPersona {
  return ERROR_PERSONA_MAP[statusCode] ?? DEFAULT_ERROR_PERSONA;
}

/**
 * 角色背景渐变配置
 */
export const CHARACTER_GRADIENTS: Record<string, string> = {
  soyorin: 'from-purple-900/50 via-purple-800/30 to-slate-900',
  taki: 'from-indigo-900/50 via-indigo-800/30 to-slate-900',
  saki: 'from-blue-900/50 via-blue-800/30 to-slate-900',
  kaname: 'from-yellow-900/50 via-yellow-800/30 to-slate-900',
  tomori: 'from-cyan-900/50 via-cyan-800/30 to-slate-900',
  anon: 'from-pink-900/50 via-pink-800/30 to-slate-900',
  mygo: 'from-rose-900/50 via-purple-800/30 to-slate-900',
};

/**
 * 获取角色背景渐变
 */
export function getCharacterGradient(character: string): string {
  return CHARACTER_GRADIENTS[character] ?? CHARACTER_GRADIENTS.mygo;
}

/**
 * 获取所有支持的错误码
 */
export function getSupportedErrorCodes(): number[] {
  return Object.keys(ERROR_PERSONA_MAP).map(Number).sort((a, b) => a - b);
}

/**
 * 检查错误码是否有人格化配置
 */
export function hasErrorPersona(statusCode: number): boolean {
  return statusCode in ERROR_PERSONA_MAP;
}

export default ERROR_PERSONA_MAP;
