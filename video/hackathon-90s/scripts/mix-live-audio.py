"""Edit retained GPT Live PCM takes, preserve provider transcripts, and create the voiced mix."""
import pathlib,json,subprocess,wave,re,hashlib
root=pathlib.Path(__file__).resolve().parent.parent
clips=json.loads((root/'src/audio-script.json').read_text())
# Explicit editorial selections exclude all unrequested clinical elaboration.
edits={
'opening':([(0,4300)],"The first time you manage a deteriorating patient shouldn't be the first time you've practised."),
'patient-pressure':([(0,3650)],"It's a heavy pressure in the middle of my chest, like someone is sitting on me."),
'patient-onset':([(0,2650)],"About forty-five minutes ago, while I was resting."),
'prepare':([(0,1450)],'Prepare aspirin.'),
'draft-ack':([(0,2500)],"Let's open the draft and review it together."),
'evidence':([(0,3500),(5900,10200)],'Every run keeps the exact record of what you said and did. In this case, aspirin was prepared. No receipt for administration.')}
manifest=[];captions=[];mix=bytearray(90*48000*2)
def run(args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
for c in clips:
 receipt=json.loads((root/f'sources/live-audio/{c["id"]}.json').read_text())
 raw=(root/f'sources/live-audio/{c["id"]}.pcm').read_bytes()
 scan=subprocess.run(['ffmpeg','-hide_banner','-f','s16le','-ar','24000','-ac','1','-i',str(root/f'sources/live-audio/{c["id"]}.pcm'),'-af','silencedetect=n=-50dB:d=0.3','-f','null','-'],capture_output=True,text=True).stderr
 tail=float(re.findall(r'silence_start: ([0-9.]+)',scan)[-1])
 segments,text=edits.get(c['id'], ([(0,round((tail+.12)*1000))],receipt['transcript'].strip()))
 selected=b''.join(raw[round(a*48):round(b*48)] for a,b in segments)
 pcm=root/f'sources/live-audio/{c["id"]}-selected.pcm';pcm.write_bytes(selected)
 # Keep at least 100ms of room within the assigned edit slot. Slower delivery for very short lines.
 seconds=len(selected)/48000;window=c['end']-c['start']-.12
 speed=max(.70,seconds/window)
 if speed>1.25:raise RuntimeError(f'{c["id"]} needs a shorter edit: speed {speed}')
 out=root/f'public/audio/{c["id"]}-edit.wav'
 run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','s16le','-ar','24000','-ac','1','-i',str(pcm),'-af',f'atempo={speed:.6f},afade=t=in:d=0.008,loudnorm=I=-18:TP=-2:LRA=7','-ar','48000','-ac','1',str(out)])
 with wave.open(str(out),'rb') as w:audio=w.readframes(w.getnframes());duration=w.getnframes()/w.getframerate()
 if duration>c['end']-c['start']+.025:raise RuntimeError('Audio exceeds slot '+c['id'])
 offset=round(c['start']*48000)*2;mix[offset:offset+len(audio)]=audio
 # Captions quote only the selected speech. Phrase groups never split a word.
 phrases=[text]
 if len(text)>115:
  sentences=re.split(r'(?<=[.!?])\s+',text)
  phrases=[]
  for sentence in sentences:
   if phrases and len(phrases[-1])+len(sentence)<105:phrases[-1]+=' '+sentence
   else:phrases.append(sentence)
 total_words=sum(len(p.split()) for p in phrases);elapsed_words=0
 for phrase in phrases:
  words=phrase.split();lines=['']
  for word in words:
   if len(lines[-1])+len(word)+1>58 and len(lines)==1:lines.append(word)
   else:lines[-1]+=(' ' if lines[-1] else '')+word
  start=c['start']+duration*elapsed_words/total_words
  elapsed_words+=len(words);end=c['start']+duration*elapsed_words/total_words
  captions.append(dict(text='\n'.join(lines),startMs=round(start*1000),endMs=round(end*1000),timestampMs=None,confidence=None,role=c['role']))
 manifest.append(dict(id=c['id'],provider='OpenAI GPT Live',model='gpt-live-1',voice=c['voice'],sessionId=receipt['sessionId'],startSeconds=c['start'],endSeconds=c['start']+duration,script=text,sourceSegmentsMs=segments,playbackRate=speed,sourceReceipt=f'sources/live-audio/{c["id"]}.json',file=f'public/audio/{c["id"]}-edit.wav',sha256=hashlib.sha256(out.read_bytes()).hexdigest()))
with wave.open(str(root/'public/audio/live-mix.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(mix)
(root/'sources/live-audio/edit-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(root/'src/captions.json').write_text(json.dumps(captions,indent=2,ensure_ascii=False)+'\n')
def tc(ms):return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
(root/'out/do-no-harm-90s.srt').write_text('\n\n'.join(f'{i+1}\n{tc(c["startMs"])} --> {tc(c["endMs"])}\n{c["text"]}' for i,c in enumerate(captions))+'\n')
print(json.dumps([dict(id=c['id'],seconds=round(c['endSeconds']-c['startSeconds'],2),speed=round(c['playbackRate'],2))for c in manifest],indent=2))
