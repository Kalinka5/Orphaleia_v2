"""Create a transparent web asset from the supplied white-background artwork."""
import sys
from pathlib import Path
sys.path.insert(0, '/tmp/orphaleia-image-tools')
import cv2
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[2]
source=Path('/Users/kalinka/Downloads/Gemini_Generated_Image_va0dusva0dusva0d.jpeg')
pixels=np.asarray(Image.open(source).convert('RGB'),dtype=np.float32)/255
h,w=pixels.shape[:2]
lo=pixels.min(2)
# White matting keeps the smoky edges and soft ground shadows genuinely translucent.
def smoothstep(x):
 x=np.clip(x,0,1)
 return x*x*(3-2*x)
def polygon(points):
 mask=np.zeros((h,w),np.float32)
 cv2.fillPoly(mask,[np.array(points,np.int32)*2],1)
 return cv2.GaussianBlur(mask,(0,0),4)
harry=polygon([(101,515),(167,463),(244,370),(264,339),(218,334),(208,291),(236,274),(320,281),(333,232),(365,210),(424,229),(429,272),(414,310),(496,320),(551,324),(573,334),(549,349),(511,351),(506,394),(423,370),(414,454),(443,529),(450,631),(484,652),(487,677),(402,682),(401,624),(395,576),(363,638),(320,608),(279,599),(234,651),(229,694),(183,700),(183,660),(214,603),(168,589),(136,567),(104,554)])
vold=polygon([(881,277),(929,268),(948,276),(1008,276),(1038,266),(1034,221),(1052,184),(1084,178),(1111,200),(1110,245),(1152,252),(1197,297),(1248,342),(1269,392),(1303,445),(1261,445),(1326,487),(1394,564),(1368,582),(1320,599),(1340,638),(1253,639),(1244,652),(1247,683),(1204,691),(1181,678),(1139,676),(1129,660),(1037,665),(997,676),(957,675),(962,652),(987,637),(983,601),(992,565),(1006,490),(1023,435),(1030,370),(1004,359),(981,374),(930,342),(922,303),(894,309),(879,297)])
character=np.maximum(harry,vold)
base=np.clip((1-lo-.014)/.986,0,1)
# Estimate edge opacity from nearby opaque pixels, keeping white spill out.
body=((lo<.72)&(character>.1)).astype(np.uint8)
interior=cv2.erode(body,np.ones((7,7),np.uint8)).astype(np.float32)
support=cv2.dilate(body,np.ones((7,7),np.uint8)).astype(np.float32)*character
local_dark=cv2.erode(lo,np.ones((9,9),np.uint8))
edge_alpha=np.clip((1-lo-.014)/np.maximum(1-local_dark-.014,.01),0,1)
opaque=np.maximum(edge_alpha,interior)
alpha=base*(1-support)+opaque*support
# Preserve the nearly white collision core and the luminous strands, which a
# global white-color key would otherwise incorrectly erase.
y,x=np.mgrid[:h,:w].astype(np.float32); x/=2;y/=2
warm=np.exp(-.5*(((x-692)/54)**2+((y-316)/71)**2))*.98
tip=np.exp(-.5*(((x-618)/10)**2+((y-326)/10)**2))
beam_y=316-(x-704)*.15
beam=np.exp(-.5*((y-beam_y)/11)**2)*smoothstep((x-700)/20)*smoothstep((851-x)/22)*.85
alpha=np.maximum(alpha,np.maximum.reduce([warm,tip,beam]))
alpha[alpha<.009]=0
# Unmix white from partial-alpha pixels to avoid white fringes on other colors.
rgb=(pixels-(1-alpha[:,:,None]))/np.maximum(alpha[:,:,None],1e-6)
rgba=np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255).astype(np.uint8)
rgba[rgba[:,:,3]==0,:3]=0
image=Image.fromarray(rgba,'RGBA')
# Trim empty margins while retaining every figure and the smoke.
yy,xx=np.where(rgba[:,:,3]>6)
box=(max(0,int(xx.min())-30),max(0,int(yy.min())-30),min(w,int(xx.max())+31),min(h,int(yy.max())+31))
image=image.crop(box)
asset=root/'apps/web/public/assets/genres/harry-potter-voldemort-duel-v2'
image.save(asset.with_suffix('.png'),optimize=True)
web=image.copy();web.thumbnail((1920,1200),Image.Resampling.LANCZOS)
web.save(asset.with_suffix('.webp'),quality=94,method=6)
for background,label in [('#fdfbf7','paper'),('#18251e','dark')]:
 preview=Image.new('RGBA',image.size,background);preview.alpha_composite(image)
 preview.thumbnail((1408,900),Image.Resampling.LANCZOS)
 preview.convert('RGB').save(root/f'output/image-edit/new-duel-{label}.jpg',quality=94)
print({'png_size':image.size,'web_size':web.size,'crop':box,'web_bytes':asset.with_suffix('.webp').stat().st_size})
