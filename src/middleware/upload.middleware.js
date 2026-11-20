
import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, callback) => {
  if (!file.mimetype.startsWith("image/")) {
    const error = new Error("Only image files are allowed.");
    error.status = 400;

    return callback(error);
  }

  callback(null, true);
};

export const uploadMenuImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});
