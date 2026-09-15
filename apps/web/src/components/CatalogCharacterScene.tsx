import s from './CatalogCharacterScene.module.css'

export function CatalogCharacterScene() {
  return <div className={s.scene} data-testid="catalog-character-scene" aria-hidden="true">
    <img
      src="/assets/catalog/winnie-the-pooh-friends-scene-pointing-fixed.webp"
      srcSet="/assets/catalog/winnie-the-pooh-friends-scene-pointing-fixed-768w.webp 768w, /assets/catalog/winnie-the-pooh-friends-scene-pointing-fixed-1280w.webp 1280w, /assets/catalog/winnie-the-pooh-friends-scene-pointing-fixed.webp 1881w"
      sizes="(max-width: 1050px) 100vw, 55vw"
      alt=""
      width="1881"
      height="836"
      loading="eager"
      decoding="async"
    />
  </div>
}
