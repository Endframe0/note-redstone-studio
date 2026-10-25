package enbqa;
import com.atemukesu.extendednoteblock.sound.*;
import com.atemukesu.extendednoteblock.util.CurvePoint;
import com.mojang.blaze3d.audio.SoundBuffer;
import net.fabricmc.loader.api.entrypoint.PreLaunchEntrypoint;
import net.minecraft.client.sounds.JOrbisAudioStream;
import net.minecraft.core.BlockPos;
import org.lwjgl.openal.*;
import com.google.gson.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import java.io.*;
import javax.sound.sampled.*;
/** Offline preview of exported envelopes with real ENB PCM and fader; not in-world recording. */
public class EnvelopePreview implements PreLaunchEntrypoint {
 record Voice(int source,int start,int duration,ActiveSoundFader fader){}
 static int buffer(SoundBuffer b)throws Exception{var m=SoundBuffer.class.getDeclaredMethod("getAlBuffer");m.setAccessible(true);return ((OptionalInt)m.invoke(b)).orElseThrow();}
 public void onPreLaunch(){try{
  var data=JsonParser.parseString(Files.readString(Path.of(System.getProperty("enb.qa.preview")))).getAsJsonObject();
  var notes=data.getAsJsonArray("notes");var buffers=new HashMap<Integer,SoundBuffer>();
  long device=SOFTLoopback.alcLoopbackOpenDeviceSOFT((String)null);
  long context=ALC10.alcCreateContext(device,new int[]{ALC10.ALC_FREQUENCY,48000,SOFTLoopback.ALC_FORMAT_CHANNELS_SOFT,SOFTLoopback.ALC_MONO_SOFT,SOFTLoopback.ALC_FORMAT_TYPE_SOFT,SOFTLoopback.ALC_FLOAT_SOFT,0});
  ALC10.alcMakeContextCurrent(context);AL.createCapabilities(ALC.createCapabilities(device));
  for(var entry:data.getAsJsonObject("samples").entrySet())try(var stream=new JOrbisAudioStream(Files.newInputStream(Path.of(entry.getValue().getAsString())))){
   var format=stream.getFormat();buffers.put(Integer.parseInt(entry.getKey()),new SustainSoundBuffer(SustainPcm.prepare(stream.readAll(),format),format));
  }
  int from=data.get("fromTick").getAsInt(),to=data.get("toTick").getAsInt(),cursor=0;var voices=new ArrayList<Voice>();var output=new ByteArrayOutputStream();double peak=0;int maxVoices=0;
  for(int tick=0;tick<to;tick++){
   while(cursor<notes.size()&&Math.round(notes.get(cursor).getAsJsonObject().get("tick").getAsDouble()*2)<=tick){
    var n=notes.get(cursor++).getAsJsonObject();int start=(int)Math.round(n.get("tick").getAsDouble()*2),duration=n.get("enbSustainTime").getAsInt();
    var fader=new ActiveSoundFader(null,BlockPos.ZERO,UUID.randomUUID(),n.get("enbVelocity").getAsInt(),duration,n.get("enbFadeInTime").getAsInt(),n.get("enbFadeOutTime").getAsInt());
    var points=new ArrayList<CurvePoint>();for(var point:n.getAsJsonArray("enbVolumePoints")){var p=point.getAsJsonObject();points.add(new CurvePoint(p.get("t").getAsFloat(),p.get("v").getAsFloat()));}fader.setVolumePoints(points);
    int source=AL10.alGenSources();AL10.alSourcei(source,AL10.AL_BUFFER,buffer(buffers.get(n.get("instrument").getAsInt())));AL10.alSourcei(source,AL10.AL_LOOPING,1);
    AL10.alSourcef(source,AL10.AL_PITCH,(float)Math.pow(2,(n.get("key").getAsDouble()+21-66)/12));AL10.alSourcef(source,AL10.AL_GAIN,fader.calculateStateAt(0).volume*.15f);AL10.alSourcePlay(source);voices.add(new Voice(source,start,duration,fader));
   }
   for(var it=voices.iterator();it.hasNext();){var v=it.next();int age=tick-v.start();if(age>=v.duration()){AL10.alDeleteSources(v.source());it.remove();}else AL10.alSourcef(v.source(),AL10.AL_GAIN,v.fader().calculateStateAt((float)age/Math.max(1,v.duration()-1)).volume*.15f);}
   maxVoices=Math.max(maxVoices,voices.size());float[] pcm=new float[2400];SOFTLoopback.alcRenderSamplesSOFT(device,pcm,2400);
   if(tick>=from){var bytes=ByteBuffer.allocate(pcm.length*2).order(ByteOrder.LITTLE_ENDIAN);for(float v:pcm){peak=Math.max(peak,Math.abs(v));bytes.putShort((short)Math.clamp(Math.round(v*32767),-32768,32767));}output.write(bytes.array());}
   if(AL10.alGetError()!=0)throw new AssertionError("OpenAL preview error at tick "+tick);
  }
  if(peak>=1)throw new AssertionError("preview clips: "+peak);
  byte[] bytes=output.toByteArray();try(var stream=new AudioInputStream(new ByteArrayInputStream(bytes),new AudioFormat(48000,16,1,true,false),bytes.length/2)){AudioSystem.write(stream,AudioFileFormat.Type.WAVE,Path.of(data.get("output").getAsString()).toFile());}
  System.out.println("ENB_ENVELOPE_PREVIEW_PASS peak="+peak+" voices="+maxVoices+" exportedNotes="+notes.size());
  System.exit(0);
 }catch(Throwable e){e.printStackTrace();System.exit(2);}}
}
