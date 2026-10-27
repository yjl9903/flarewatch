import type { PageConfig } from '@flarewatch/shared';

export const pageConfig: PageConfig = {
  timeZone: 'Asia/Shanghai',
  title: 'Anime Garden 服务监控',
  links: [
    { label: 'Anime Garden', link: 'https://animes.garden/' },
    { label: 'OneKuma', link: 'https://onekuma.cn/' },
  ],
  group: {
    'Anime Garden 页面': [
      'animegarden_home',
      'animegarden_home_cn_telecom',
      'animegarden_home_cn_unicom',
      'animegarden_home_cn_mobile',
      'animegarden_home_hk',
      'animegarden_home_sg',
      'animegarden_home_jp',
      'animegarden_home_us',
      'animegarden_resources',
      'animegarden_subject',
      'animegarden_detail',
      'animegarden_docs',
    ],
    'Anime Garden 服务': ['animegarden_api', 'animegarden_feed', 'bgmx_api'],
    'Anime Garden 源站': ['source_dmhy', 'source_mikan', 'source_bangumi'],
    'Torrent 服务': ['torrenta_home'],
    KeepShare: ['keepshare_resource'],
    lnovel: ['lnovel_home', 'lnovel_api'],
    OneKuma: ['umami', 'pikpak_referral', 'onekuma_home', 'xlor_home'],
    域名到期: ['domain_animes_garden', 'domain_onekuma_cn', 'domain_xlor_cn'],
  },
};
