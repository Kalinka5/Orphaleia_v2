import s from './CatalogCharacterScene.module.css'

export function CatalogCharacterScene() {
  return <div className={s.scene} data-testid="catalog-character-scene" aria-hidden="true">
    <img
      src="/assets/catalog/winnie-the-pooh-friends-scene-pointing-fixed.png"
      alt=""
      width="1881"
      height="836"
      loading="eager"
      decoding="async"
    />
  </div>
}
