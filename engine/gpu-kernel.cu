// Each CUDA thread independently mutates and measures one complete folded layout.
// The CPU planner and electrical auditor remain the authority before export.
__device__ unsigned next(unsigned &s){s^=s<<13;s^=s>>17;s^=s<<5;return s;}
__device__ int imin(int a,int b){return a<b?a:b;}
__device__ int imax(int a,int b){return a>b?a:b;}
__device__ int ab(int a){return a<0?-a:a;}
__device__ void mark(int *b,int x,int y,int z){b[0]=imin(b[0],x);b[1]=imax(b[1],x);b[2]=imin(b[2],y);b[3]=imax(b[3],y);b[4]=imin(b[4],z);b[5]=imax(b[5],z);}
extern "C" __global__ void measure(const int *music,int n,const int *parents,int parentN,int stride,int batch,unsigned seed,int mutate,int *out,int *countsOut,int *shiftsOut,int *scratch){
 int id=blockIdx.x*blockDim.x+threadIdx.x;if(id>=batch)return;
 unsigned rng=seed^(id+1)*2654435761u;int pi=id%parentN;const int *p=parents+pi*(4+2*stride);
 int cap=p[0],rows=p[1],R=p[2],direct=p[3]&1,external=p[3]&2,firstK=direct?1:2;
 int *cs=countsOut+id*stride,*sh=shiftsOut+id*stride,*st=scratch+id*stride*2,*zs=st+stride,*o=out+id*8;
 o[0]=0;o[5]=pi;o[6]=cap;o[7]=rows;
 for(int r=0;r<R;r++){cs[r]=p[4+r];sh[r]=p[4+stride+r];}
 if(mutate&&id>=parentN){
  int edits=1+next(rng)%8;
  for(int e=0;e<edits;e++){int r=next(rng)%R;if(next(rng)%3&&r+1<R){int d=(int)(next(rng)%9)-4;if(cs[r]+d>=1&&cs[r]+d<=cap&&cs[r+1]-d>=1&&cs[r+1]-d<=cap){int cut=0;for(int q=0;q<=r;q++)cut+=cs[q];cut+=d;if(music[cut*4]-music[(cut-1)*4]>=2){cs[r]+=d;cs[r+1]-=d;}}}else sh[r]=next(rng)%(cap-cs[r]+1);}
 }
 int at=0;for(int r=0;r<R;r++){st[r]=at;at+=cs[r];sh[r]=imin(sh[r],cap-cs[r]);}if(at!=n)return;
 int layers=(R+rows-1)/rows,span=0;
 // Spatial coordinates are translated into temporal row indexes on odd layers.
 for(int l=0;l<layers;l++){int z=0;for(int s=0;s<rows;s++){
   if(s){int width=2;if(s%2){width=4;int a=l*rows+(l%2?rows-s:s-1),b=l*rows+(l%2?rows-1-s:s);
     for(int c=0;c<cap;c++){int da=0,db=0;
      if(a<R){int k=a%2?cap-1-sh[a]-c:c-sh[a];if(k>=0&&k<cs[a]){int i=st[a]+k;da=imax(1,(!direct)+imax((music[i*4+1]+1)/2,music[i*4+2]));}}
      if(b<R){int k=b%2?cap-1-sh[b]-c:c-sh[b];if(k>=0&&k<cs[b]){int i=st[b]+k;db=imax(1,(!direct)+imax((music[i*4+1]+1)/2,music[i*4+2]));}}
      width=imax(width,da+db+2);
     }}z+=width;}
   int r=l*rows+(l%2?rows-1-s:s);if(r<R)zs[r]=z;
  }span=imax(span,z);}
 for(int l=0;l<layers;l++){int r=l*rows+(l%2?0:rows-1);if(r<R)zs[r]=span;}
 int b[6]={1000000,-1000000,1000000,-1000000,1000000,-1000000};
 int px=0,py=0,pz=0,pt=0,pdir=0,penalty=0;
 for(int r=0;r<R;r++){int l=r/rows,local=r%rows,s=l%2?rows-1-local:local,dir=r%2?-1:1,branch=s%2?-1:1;
  int y=2+l*3,z=zs[r],startX=l%2+(dir>0?3*sh[r]:3*(cap-1-sh[r]));
  for(int j=0;j<cs[r];j++){int i=st[r]+j,t=music[i*4],nn=music[i*4+1],sn=music[i*4+2];int depth=imax(1,(!direct)+imax((nn+1)/2,sn)),x=startX+dir*3*j,side=l%2?-1:1,sideCount=depth-firstK+1;
   mark(b,x,y,z);mark(b,x,y+1,z+branch*depth);
   if(nn){mark(b,x+side,y-1,z+branch*firstK);mark(b,x+side,y,z+branch*(firstK-1+imin(sideCount,nn)));if(nn>sideCount){mark(b,x-side,y-1,z+branch*firstK);mark(b,x-side,y,z+branch*(firstK-1+nn-sideCount));}if(sn)mark(b,x+side,y-2,z+branch*firstK);}
   if(i&&!j){int gap=t-pt,outer=pdir>0?3*(cap-1)+3:-2;mark(b,outer,py,pz);mark(b,outer,y+1,z);int length=ab(px-outer)+ab(x-outer)+ab(z-pz);if(local==0){mark(b,outer,y+1,pz+(s==0?-1:1));length+=6;}int lower=imax(1,imax((length-1+14)/15,(gap+3)/4));if(gap<lower)penalty+=lower-gap;}
   px=x;py=y+1;pz=z;pt=t;pdir=dir;
  }
 }
 int start=3*sh[0];if(external){mark(b,start-1,2,zs[0]);mark(b,start-1,3,zs[0]);}else{mark(b,start-2,2,zs[0]);mark(b,start-2,3,zs[0]-1);}
 int x=b[1]-b[0]+1,y=b[3]-b[2]+1,z=b[5]-b[4]+1;o[0]=x*y*z;o[1]=x;o[2]=y;o[3]=z;o[4]=penalty;
}
