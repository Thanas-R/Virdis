import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Field, fields as defaultFields } from "@/data/fields";

export function useSavedFields(userId: string | undefined) {
  const [savedFields, setSavedFields] = useState<Field[]>(defaultFields);
  const [loading, setLoading] = useState(true);

  // Load saved fields from database
  const loadFields = useCallback(async () => {
    if (!userId) {
      setSavedFields(defaultFields);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_saved_fields")
        .select("*")
        .eq("user_id", userId);

      if (error) throw error;

      if (data && data.length > 0) {
        const fields: Field[] = data.map((row: any) => ({
          id: row.field_id,
          name: row.field_name,
          area: Number(row.field_area),
          crop: row.field_crop,
          cropEmoji: row.field_crop_emoji || "",
          location: row.field_location || "",
          color: row.field_color || "#888888",
          ndviChange: row.field_ndvi_change ? Number(row.field_ndvi_change) : undefined,
          group: row.field_group || undefined,
          coordinates: row.field_coordinates as [number, number][][],
        }));
        setSavedFields(fields);
      } else {
        // First time: seed with default fields
        await saveAllFields(userId, defaultFields);
        setSavedFields(defaultFields);
      }
    } catch (e) {
      console.error("Failed to load saved fields", e);
      setSavedFields(defaultFields);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  const saveAllFields = async (uid: string, fields: Field[]) => {
    const rows = fields.map((f) => ({
      user_id: uid,
      field_id: f.id,
      field_name: f.name,
      field_area: f.area,
      field_crop: f.crop,
      field_crop_emoji: f.cropEmoji,
      field_location: f.location,
      field_color: f.color,
      field_coordinates: f.coordinates,
      field_group: f.group || null,
      field_ndvi_change: f.ndviChange ?? null,
    }));

    await supabase.from("user_saved_fields").upsert(rows, { onConflict: "user_id,field_id" });
  };

  const addField = async (field: Field) => {
    if (!userId) return;
    setSavedFields((prev) => {
      if (prev.some((f) => f.id === field.id)) return prev;
      return [...prev, field];
    });
    await supabase.from("user_saved_fields").upsert({
      user_id: userId,
      field_id: field.id,
      field_name: field.name,
      field_area: field.area,
      field_crop: field.crop,
      field_crop_emoji: field.cropEmoji,
      field_location: field.location,
      field_color: field.color,
      field_coordinates: field.coordinates,
      field_group: field.group || null,
      field_ndvi_change: field.ndviChange ?? null,
    }, { onConflict: "user_id,field_id" });
  };

  const removeField = async (fieldId: string) => {
    if (!userId) return;
    setSavedFields((prev) => prev.filter((f) => f.id !== fieldId));
    await supabase.from("user_saved_fields").delete().eq("user_id", userId).eq("field_id", fieldId);
  };

  const updateField = async (field: Field) => {
    if (!userId) return;
    setSavedFields((prev) => prev.map((f) => (f.id === field.id ? field : f)));
    await supabase.from("user_saved_fields").update({
      field_name: field.name,
      field_area: field.area,
      field_crop: field.crop,
      field_crop_emoji: field.cropEmoji,
      field_location: field.location,
      field_color: field.color,
      field_coordinates: field.coordinates,
      field_group: field.group || null,
      field_ndvi_change: field.ndviChange ?? null,
    }).eq("user_id", userId).eq("field_id", field.id);
  };

  const toggleField = async (field: Field) => {
    const exists = savedFields.some((f) => f.id === field.id);
    if (exists) {
      await removeField(field.id);
    } else {
      await addField(field);
    }
  };

  return { savedFields, loading, addField, removeField, updateField, toggleField, reload: loadFields };
}
