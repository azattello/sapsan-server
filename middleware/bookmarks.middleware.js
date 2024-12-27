const Track = require('../models/Track'); // Подключаем модель Track
const User = require('../models/User');   // Подключаем модель User

// Функция для получения закладок пользователя с учетом пагинации
const getUserBookmarks = async (req, res) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // Количество записей на одной странице
    const skip = (page - 1) * limit;

    // Находим пользователя
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Общее количество закладок пользователя (до фильтрации по статусу)
    const totalBookmarks = user.bookmarks.length;

    // Берём закладки текущей страницы
    const bookmarksPage = user.bookmarks.slice(skip, skip + limit);

    // Обрабатываем закладки
    const updatedBookmarks = await Promise.all(
      bookmarksPage.map(async (bookmark) => {
        if (!bookmark.trackId) {
          // Если trackId отсутствует, ищем трек по trackNumber
          const track = await Track.findOne({ track: bookmark.trackNumber });
          if (track) {
            bookmark.trackId = track._id;

            // Сохраняем trackId в базе
            await User.updateOne(
              { _id: userId, 'bookmarks.trackNumber': bookmark.trackNumber },
              { $set: { 'bookmarks.$.trackId': track._id } }
            );

            // Обновляем пользователя в треке, если он не совпадает
            if (!track.user || track.user !== user.phone) {
              track.user = user.phone;
              await track.save();
            }

            // Загружаем историю и статус трека
            const populatedTrack = await Track.findById(track._id).populate(
              'history.status',
              'statusText'
            );

            // Проверяем статус "Получено"
            const hasReceivedStatus = populatedTrack.history.some(
              (historyItem) =>
                historyItem.status && historyItem.status.statusText === 'Получено'
            );

            if (hasReceivedStatus) return null;

            return {
              ...bookmark,
              trackDetails: populatedTrack,
              history: populatedTrack.history,
              price: track.price,
              weight: track.weight,
            };
          } else {
            // Трек не найден
            return {
              trackNumber: bookmark.trackNumber,
              createdAt: bookmark.createdAt,
              description: bookmark.description,
            };
          }
        }

        // Если trackId существует, загружаем трек
        const track = await Track.findById(bookmark.trackId).populate(
          'history.status',
          'statusText'
        );

        // Обновляем пользователя в треке, если он не совпадает
        if (!track.user || track.user !== user.phone) {
          track.user = user.phone;
          await track.save();
        }

        // Проверяем статус "Получено"
        const hasReceivedStatus = track.history.some(
          (historyItem) =>
            historyItem.status && historyItem.status.statusText === 'Получено'
        );

        if (hasReceivedStatus) return null;

        return {
          ...bookmark,
          trackDetails: track,
          history: track.history,
          price: track.price,
          weight: track.weight,
        };
      })
    );

    // Удаляем `null` из массива (треки со статусом "Получено")
    const filteredBookmarks = updatedBookmarks.filter(Boolean);

    // Количество страниц рассчитывается на основе общего числа закладок
    const totalPages = Math.ceil(totalBookmarks / limit);

    res.status(200).json({
      updatedBookmarks: filteredBookmarks,
      totalPages,
      totalBookmarks,
    });
  } catch (error) {
    console.error('Ошибка при получении закладок пользователя:', error);
    res.status(500).json({ message: 'Произошла ошибка при получении закладок' });
  }
};

module.exports = { getUserBookmarks };
