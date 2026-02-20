

# Ta bort "Bilder"-sektionen från BookingInfoExpanded

## Vad som ändras
Tar bort den duplicerade bildsektionen i `BookingInfoExpanded.tsx` (raderna som visar "Bilder" med `imageAttachments`). Bilderna visas redan under "Filer"-fliken via `ProjectFiles.tsx`.

## Tekniska detaljer
**Fil:** `src/components/project/BookingInfoExpanded.tsx`
- Ta bort importen av `ImageThumbnail` och `Image as ImageIcon`
- Ta bort variablerna `uniqueAttachments` och `imageAttachments`
- Ta bort hela JSX-blocket for "Bilder" (rader ca 155-170)
- Behåll `BookingAttachment`-interfacet och `bookingAttachments`-propen om den används av andra komponenter, annars rensa även dessa

